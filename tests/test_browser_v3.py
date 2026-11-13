"""v3 mobile Chromium smoke tests against synthetic deals (not live OzBargain)."""
import datetime as dt
import json
from test_browser import markup, NOW


def row(id, title, age=0):
    return {'id': str(id), 'title': title,'url': f'https://www.ozbargain.com.au/node/{id}',
            'published':(NOW-dt.timedelta(minutes=age)).isoformat(),
            'merchant':'Test Store','category':'Electronics','description':'A testing description'}


def main():
    from playwright.sync_api import sync_playwright
    issues=[]
    feed={'updatedAt':NOW.isoformat(), 'items':[
        row(800001,'$49 Robot vacuum bargain @ Test Store', 0),
        row(800002,'Free software package @ Test Store', 1),
        row(800003,'$225 Gaming monitor @ Test Store', 2),
        row(800004,'Great deal without price @ Test Store', 3),
        *[row(800100+i, f'${i+10}.95 More deals {i} @ Test Store',4+i) for i in range(90)]
    ]}
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        page.on('pageerror',lambda e:issues.append(str(e)))
        page.set_content(markup(feed))
        page.locator('.deal-card').first.wait_for()
        page.locator('#filtersButton').click()
        page.locator('#favoriteKeywordsInput').fill('robot vacuum')
        page.locator('#priceFilterSelect').select_option('under50')
        page.locator('#applyFiltersButton').click()
        titles=page.locator('.card-title').all_inner_texts()
        assert any('Robot vacuum' in title for title in titles)
        assert not any('Gaming monitor' in title for title in titles)
        assert not any('without price' in title for title in titles)
        assert page.locator('.deal-card.is-favourite').count()==1
        page.locator('#matchOnlyButton').click()
        assert page.locator('.deal-card').count()==1
        page.locator('#matchOnlyButton').click()
        page.locator('#filtersButton').click()
        page.locator('#priceFilterSelect').select_option('free')
        page.locator('#applyFiltersButton').click()
        assert page.locator('.deal-card').count()==1
        assert 'Free software' in page.locator('.card-title').first.inner_text()
        page.locator('#filtersButton').click()
        page.locator('#priceFilterSelect').select_option('any')
        page.locator('#applyFiltersButton').click()
        # Card action should update in place rather than rebuild the whole list.
        page.evaluate('window.__originalCard = document.querySelector(".deal-card")')
        page.locator('.deal-card').first.locator('[data-card-action="save"]').click()
        assert page.evaluate('window.__originalCard === document.querySelector(".deal-card")')
        assert json.loads(page.evaluate('window.__storage.dealstream_saved_v1'))
        # A newly published matching deal triggers only an in-app, silent toast.
        extra=row(899999,'$29.99 Robot vacuum flash deal @ Test Store')
        page.evaluate('''(newItem)=>{
          window.__clockOffset=600001;
          const realNow=Date.now.bind(Date);
          Date.now=()=>realNow()+window.__clockOffset;
          window.__data.items.unshift(newItem);
          window.__autoChecks.find(x=>x.ms===600000).fn();
        }''',extra)
        page.wait_for_function('document.querySelector(".deal-card")?.dataset.dealId === "899999"')
        assert 'favourite match' in page.locator('#toastText').inner_text().lower()
        # A brand new browsing session keeps saved history and v2 keys.
        storage=page.evaluate('window.__storage')
        page.set_content(markup(feed,storage))
        page.locator('.deal-card').first.wait_for()
        assert 'robot vacuum' in json.loads(page.evaluate('window.__storage.dealstream_prefs_v2'))['favoriteKeywords'][0].lower()
        page.locator('#settingsButton').click()
        assert 'Local history storage is working' in page.locator('#storageStatus').inner_text()
        assert not issues, issues
        # A fast flick without exposure time must not mark an unseen deal.
        fast=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        fast.on('pageerror',lambda e:issues.append(str(e)))
        fast.set_content(markup(feed))
        fast.locator('.deal-card').first.wait_for()
        fast.evaluate('window.scrollTo(0,900)')
        fast.wait_for_timeout(60)
        assert not json.loads(fast.evaluate('window.__storage.dealstream_seen_v1 || "{}"')), 'Fast flick marked a deal seen'
        fast.evaluate('window.scrollTo(0,0)')
        for _ in range(6):
            fast.wait_for_timeout(160)
            fast.evaluate('window.__autoChecks.find(x=>x.ms===170).fn()')
        fast.evaluate('window.scrollTo(0,300)')
        fast.wait_for_timeout(80)
        fast.evaluate('window.__autoChecks.find(x=>x.ms===170).fn()')
        assert json.loads(fast.evaluate('window.__storage.dealstream_seen_v1 || "{}"')), 'Deliberately viewed deal was not marked'
        assert not issues, issues
        fast.close()
        print('PASS: dwell-based seen tracking, fast flick protection, favourites, price filtering, saved history, quiet alerts')
        print('PASS: favourite matching, under-$50/free filtering, incremental save, quiet new-deal alerts, storage persistence')
        browser.close()

if __name__=='__main__': main()
