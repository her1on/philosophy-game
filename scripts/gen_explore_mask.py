#!/usr/bin/env python3
"""
Генерация карты проходимости для режима прогулки (по плоской тайловой карте).
Вход:  img/explore_map.png
Выход: img/explore_mask.png  (чёрное = стена, белое = можно идти)

Подход: карта схлопывается в палитру из 16 цветов; каждый цвет классифицируется
(вода/деревья/тёмное = стена). Горы — нейтрально-серые — блокируются только в лесной
(левой) зоне, чтобы не задеть светлый камень мостовой в городе. Затем проходимое чуть
расширяется, но вода остаётся жёсткой.

Запуск:  python3 scripts/gen_explore_mask.py   (нужны pillow, numpy)
"""
import numpy as np
from PIL import Image, ImageFilter

im  = Image.open('img/explore_map.png').convert('RGB')
rgb = np.asarray(im).astype(int)
H, W, _ = rgb.shape
q   = im.quantize(colors=16, method=Image.MEDIANCUT, dither=Image.NONE)
idx = np.asarray(q)
pal = q.getpalette()[:16 * 3]

def is_wall(i):
    r, g, b = pal[i*3], pal[i*3+1], pal[i*3+2]
    br = (r + g + b) / 3
    if b > r + 15 and b > 60:           return True   # вода / синие крыши
    if g >= r and g > b and br < 72:    return True   # деревья (трава светлее — ок)
    if br < 70:                          return True   # очень тёмное (тени, тёмные крыши)
    if r > g > b and br < 110 and (r - b) > 35: return True  # коричневые крыши (мост защищаем ниже)
    return False

def is_water(i):
    r, g, b = pal[i*3], pal[i*3+1], pal[i*3+2]
    return b > r + 15 and b > 60 and b >= g - 10

block_ids = [i for i in range(16) if is_wall(i)]
water_ids = [i for i in range(16) if is_water(i)]

blocked = np.isin(idx, block_ids)
sat = rgb.max(2) - rgb.min(2)
west = np.broadcast_to(np.arange(W)[None, :], (H, W)) < int(0.50 * W)
blocked |= west & (sat < 28)            # горы/скалы в лесу = нейтральный серый

water = np.isin(idx, water_ids)
walk = ~blocked
walk = (np.asarray(Image.fromarray(np.where(walk, 255, 0).astype('uint8'), 'L')
                   .filter(ImageFilter.MaxFilter(5))) > 127) & (~water)
# защита моста: принудительно оставляем проходимым (он попадает под правило коричневого)
yy, xx = np.mgrid[0:H, 0:W]
bridge = (xx > 0.43*W) & (xx < 0.55*W) & (yy > 0.49*H) & (yy < 0.56*H)
walk |= bridge
blocked = ~walk

print('заблокировано:', round(100 * blocked.mean(), 1), '%')
Image.fromarray(np.where(blocked, 0, 255).astype('uint8'), 'L').save('img/explore_mask.png')

# превью для проверки (не коммитим)
ov = np.asarray(im).astype(float)
ov[blocked] = ov[blocked] * 0.30 + np.array([0, 200, 255]) * 0.70   # голубой = стена
Image.fromarray(ov.astype('uint8')).save('/tmp/overlay.png')
