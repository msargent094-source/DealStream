"""Local Chromium smoke tests without external network: python tests/test_browser.py."""
import datetime as dt
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
NOW = dt.datetime.now(dt.timezone.utc)

def items(n):
    return [dict(id=str(900000+i), title=f'${i+10}.99 Great deal {i} @ Store{i%3}',
        url=f'https://www.ozbargain.com.au/node/{900000+i}',
        published=(NOW-dt.timedelta(minutes=i*2)).isoformat(), merchant=f'Store{i%3}',
        category='Electronics' if i%2 else 'Fashion',
        description=f'Test deal number {i} with a description.') for i in range(n)]

def markup(feed, storage=None):
    index=(ROOT/'index.html').read_text()
    index=re.sub(r'<link rel="(?:manifest|icon|apple-touch-icon)"[^>]*>', '', index)
    index=index.replace('<link rel="stylesheet" href="./styles.css">','<style>'+ (ROOT/'styles.css').read_text() +'</style>')
    index=re.sub(r'<script>if\(\x27serviceWorker\x27[\s\S]+?</script>', '', index)
    injection='''<script>
      window.__data = FEED;
      window.__storage = STORAGE;
      var __testStore = {getItem:k=>(Object.prototype.hasOwnProperty.call(window.__storage,k)?window.__storage[k]:null),
        setItem:(k,v)=>{window.__storage[k]=String(v)},removeItem:k=>delete window.__storage[k]};
      Object.defineProperty(window,'localStorage',{value:__testStore,configurable:true});
      Object.defineProperty(window,'sessionStorage',{value:__testStore,configurable:true});
      window.fetch = async ()=>({ok:true,json:async()=>window.__data});
      window.__autoChecks=[];
      window.setInterval=(fn,ms)=>{window.__autoChecks.push({fn,ms});return window.__autoChecks.length;};
    </script>'''.replace('FEED',json.dumps(feed)).replace('STORAGE',json.dumps(storage or {}))
    index=index.replace('<script src="./app.js" defer></script>',injection+'<script>'+(ROOT/'app.js').read_text()+'</script>')
    return index


def main():
    from playwright.sync_api import sync_playwright
    errs=[]
    with sync_playwright() as pw:
        b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True,is_mobile=True)
        pg.on('pageerror',lambda x:errs.append(str(x)))
        feed=dict(updatedAt=NOW.isoformat(),items=items(85))
        pg.set_content(markup(feed));pg.locator('.deal-card').first.wait_for()
        print('first:',pg.locator('.deal-card').count(),errs)
        assert pg.locator('.deal-card').count()>=40
        assert 'Great deal 0' in pg.locator('.deal-card').first.inner_text()
        pg.locator('.deal-card').first.locator('.card-action').first.click()
        assert '900000' in pg.evaluate('JSON.stringify(window.__storage)')
        storage=pg.evaluate('window.__storage')
        # Next browser visit retains saved records.
        pg.set_content(markup(feed,storage));pg.locator('.deal-card').first.wait_for()
        pg.locator('[data-tab="saved"]').click()
        assert pg.locator('.deal-card').count()==1
        assert 'Great deal 0' in pg.locator('.deal-card').first.inner_text()
        pg.locator('#filtersButton').click()
        pg.locator('#mutedKeywordsInput').fill('Great deal 1')
        pg.locator('#applyFiltersButton').click()
        pg.locator('[data-tab="all"]').click()
        assert all('Great deal 1 @' not in t for t in pg.locator('.card-title').all_inner_texts())
        pg.locator('#clearFilterButton').click()
        pg.locator('#settingsButton').click()
        pg.locator('#themeSelect').select_option('dark')
        pg.locator('#fontSelect').select_option('large')
        pg.locator('[data-close="settingsDialog"]').click()
        assert pg.locator('html').get_attribute('data-theme')=='dark'
        pg.locator('.deal-card').nth(1).locator('.card-title a').evaluate('(a)=>a.click()')
        seen=json.loads(pg.evaluate('window.__storage["dealstream_seen_v1"]'))
        assert len(seen)>0
        storage=pg.evaluate('window.__storage')
        # Deal falls out of feed: the title and link survive.
        feed=dict(updatedAt=NOW.isoformat(),items=items(85)[1:])
        pg.set_content(markup(feed,storage));pg.locator('.deal-card').first.wait_for()
        assert pg.locator('html').get_attribute('data-theme')=='dark'
        pg.locator('[data-tab="saved"]').click()
        assert 'Great deal 0' in pg.locator('.deal-card').first.inner_text()
        assert not errs,errs
        # Verify 10-minute polling and that background updates do not jump the page.
        auto_pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True,is_mobile=True)
        auto_pg.on('pageerror',lambda x:errs.append(str(x)))
        auto_pg.set_content(markup(dict(updatedAt=NOW.isoformat(),items=items(85))))
        auto_pg.locator('.deal-card').first.wait_for()
        assert auto_pg.evaluate('window.__autoChecks.length') == 2
        assert auto_pg.evaluate('window.__autoChecks.some(x=>x.ms===600000)')
        auto_pg.locator('.deal-card').first.locator('.card-action').first.click()
        saved_before=auto_pg.evaluate('window.__storage.dealstream_saved_v1')
        row=dict(id='999999',title='$9.99 Automatic refresh deal @ Test Store',
            url='https://www.ozbargain.com.au/node/999999',
            published=(NOW+dt.timedelta(minutes=2)).isoformat(),
            merchant='Test Store',category='Electronics',description='Fresh deal')
        auto_pg.evaluate("""(row)=>{
          window.__clockOffset=600001;
          const original=Date.now.bind(Date);
          Date.now=()=>original()+window.__clockOffset;
          window.__data.items.unshift(row);
          window.__autoChecks.find(x=>x.ms===600000).fn();
        }""",row)
        auto_pg.wait_for_function("document.querySelector('.deal-card')?.dataset.dealId === '999999'")
        assert auto_pg.evaluate('window.__storage.dealstream_saved_v1')==saved_before
        auto_pg.evaluate('window.scrollTo(0, 1250)')
        auto_pg.wait_for_function('window.scrollY>160')
        next_row=dict(id='999998',title='$8.88 Second automatic refresh @ Test Store',
            url='https://www.ozbargain.com.au/node/999998',
            published=(NOW+dt.timedelta(minutes=3)).isoformat(),
            merchant='Test Store',category='Electronics',description='Fresh deal 2')
        auto_pg.evaluate("""(row)=>{
          window.__clockOffset+=600001;
          window.__data.items.unshift(row);
          window.__autoChecks.find(x=>x.ms===600000).fn();
        }""",next_row)
        auto_pg.wait_for_function("document.querySelector('#banner').textContent.includes('new deal')")
        assert auto_pg.evaluate("document.querySelector('.deal-card').dataset.dealId")=='999999'
        assert auto_pg.evaluate('window.scrollY')>160
        auto_pg.evaluate('window.scrollTo(0,0)')
        auto_pg.wait_for_function("document.querySelector('.deal-card')?.dataset.dealId === '999998'")
        assert auto_pg.evaluate('window.__storage.dealstream_saved_v1')==saved_before
        auto_pg.close()
        pg.screenshot(path='/mnt/data/dealstream-v2-mobile-test.png',full_page=False)
        print('PASS: browser UI, archived saved records, filters, themes, seen history, no JS errors')
        b.close()

if __name__=='__main__':main()
