#!/usr/bin/env python3
"""Generate a dependency-free maskable 512px PNG icon for GitHub Pages."""
from pathlib import Path
import math
import struct
import zlib

SIZE = 512
OUT = Path(__file__).resolve().parents[1] / "icons" / "icon-512.png"

def distance(x, y, a, b, c, d):
    dx, dy = c - a, d - b
    t = max(0, min(1, ((x-a)*dx + (y-b)*dy)/(dx*dx+dy*dy)))
    return math.hypot(x-(a+t*dx), y-(b+t*dy))

def chunk(name, data):
    return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name+data)&0xffffffff)

def main():
    pixels = bytearray()
    for y in range(SIZE):
        pixels.append(0)
        for x in range(SIZE):
            stroke = min(distance(x,y,139,262,221,337), distance(x,y,221,337,379,164))
            if stroke < 20:
                pixels.extend((255,255,255))
            else:
                pixels.extend((184,47,56))
    payload = b"\x89PNG\r\n\x1a\n"
    payload += chunk(b"IHDR",struct.pack(">IIBBBBB",SIZE,SIZE,8,2,0,0,0))
    payload += chunk(b"IDAT",zlib.compress(bytes(pixels),9))
    payload += chunk(b"IEND",b"")
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_bytes(payload)
    print("Generated",OUT,"size",len(payload))

if __name__ == "__main__":
    main()
