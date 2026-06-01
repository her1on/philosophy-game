#!/usr/bin/env python3
"""
Свечение направлений из РУЧНОЙ обводки в draw.chat.
Вход:  scripts/explore_highlights_drawn.png (карта, поверх — КРАСНЫЕ контуры 9 целей)
Выход: img/explore_glow.png (RGBA, золотой ореол по контурам, прозрачный фон)
Печатает центры 9 областей (доли карты) — для NPC_FRAC в philosophia.html.
"""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
src = Image.open('scripts/explore_highlights_drawn.png').convert('RGB')
a = np.asarray(src).astype(int)
nonwhite = ~((a[...,0]>245)&(a[...,1]>245)&(a[...,2]>245))
ys, xs = np.where(nonwhite)
crop = src.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1)).resize((1536,1024), Image.NEAREST)
c = np.asarray(crop).astype(int)
red = (c[...,0]>150)&(c[...,1]<95)&(c[...,2]<95)
lab, n = ndimage.label(red, structure=np.ones((3,3)))
sizes = ndimage.sum(red, lab, range(1, n+1))
cents = ndimage.center_of_mass(red, lab, range(1, n+1))
H, W = red.shape
comps = sorted([(cents[i][1]/W, cents[i][0]/H) for i in range(n) if sizes[i] > 200])
print('областей:', len(comps))
for fx, fy in comps: print(f'  [{fx:.3f}, {fy:.3f}]')
g = Image.fromarray(np.where(red,255,0).astype('uint8'),'L').filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(6))
ga = np.asarray(g).astype(float)/255.0
rgba = np.zeros((H,W,4),'uint8'); rgba[...,0]=255; rgba[...,1]=205; rgba[...,2]=90
rgba[...,3] = (np.clip(ga*2.0,0,1)*255).astype('uint8')
Image.fromarray(rgba,'RGBA').save('img/explore_glow.png')
print('img/explore_glow.png готов')
