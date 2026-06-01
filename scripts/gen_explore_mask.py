#!/usr/bin/env python3
"""
Генерация карты проходимости для режима прогулки.
Вход:  img/explore_map.png  (пиксельная карта)
Выход: img/explore_mask.png (чёрное = стена, белое = можно идти)

Логика: блокируем воду, тёмное (стволы/тени), тёмно-зелёное (деревья),
тусклый серый потемнее (скалы/стены). Затем расширяем проходимое на ~4px,
чтобы тропы были шире, но воду заново «зашиваем» жёстко.

Запуск:  python3 scripts/gen_explore_mask.py
Зависимости: pip install pillow numpy
"""
import numpy as np
from PIL import Image, ImageFilter

SRC = 'img/explore_map.png'
OUT = 'img/explore_mask.png'

im = np.asarray(Image.open(SRC).convert('RGB')).astype(int)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
bright = im.mean(2); sat = im.max(2) - im.min(2)

water   = (b > r + 8) & (b > g + 2) & (b > 50)
blocked = water \
    | (bright < 72) \
    | ((g >= r - 2) & (g > b + 10) & (bright < 120)) \
    | ((sat < 26) & (bright < 145))

walk = ~blocked
walk = np.asarray(Image.fromarray(np.where(walk, 255, 0).astype('uint8'), 'L')
                  .filter(ImageFilter.MaxFilter(9))) > 127
walk = walk & (~water)          # воду не отдаём расширению
blocked = ~walk

print('заблокировано:', round(100 * blocked.mean(), 1), '%')
Image.fromarray(np.where(blocked, 0, 255).astype('uint8'), 'L').save(OUT)
print('сохранено:', OUT)
