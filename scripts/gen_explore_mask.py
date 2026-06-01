#!/usr/bin/env python3
"""
Карта проходимости для режима прогулки — из РУЧНОГО рисунка дорожек.

Вход:  scripts/explore_paths_drawn.png
       (это explore_map.png, поверх которой КРАСНЫМИ линиями нарисованы дорожки,
        где игрок может ходить — рисовалось в draw.chat)
Выход: img/explore_mask.png  — белое = идти, чёрное = стена

Красные штрихи распознаются по цвету, приводятся к размеру карты и расширяются
до ширины тропы; всё остальное — стена. Никакой цветовой эвристики по самой карте.

Чтобы изменить проходимость — перерисуй красные линии в исходнике и запусти скрипт.
Запуск:  python3 scripts/gen_explore_mask.py   (нужны pillow, numpy)
"""
import numpy as np
from PIL import Image, ImageFilter

MAP_W, MAP_H = 1536, 1024
PATH = 27   # ширина расширения дорожек (нечётное; больше = шире проходимая полоса)

src = Image.open('scripts/explore_paths_drawn.png').convert('RGB')
a = np.asarray(src).astype(int)

# обрезаем белые поля холста до самой карты
nonwhite = ~((a[..., 0] > 245) & (a[..., 1] > 245) & (a[..., 2] > 245))
ys, xs = np.where(nonwhite)
crop = src.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).resize((MAP_W, MAP_H), Image.NEAREST)

c = np.asarray(crop).astype(int)
r, g, b = c[..., 0], c[..., 1], c[..., 2]
red = (r > 130) & (g < 110) & (b < 110) & (r > g + 45) & (r > b + 45)

walk = np.asarray(Image.fromarray(np.where(red, 255, 0).astype('uint8'), 'L')
                  .filter(ImageFilter.MaxFilter(PATH))) > 127
print('проходимо:', round(100 * walk.mean(), 1), '%')

Image.fromarray(np.where(walk, 255, 0).astype('uint8'), 'L').save('img/explore_mask.png')

# превью для проверки (голубой = стена); не коммитим
mp = np.asarray(Image.open('img/explore_map.png').convert('RGB')).astype(float)
mp[~walk] = mp[~walk] * 0.30 + np.array([0, 200, 255]) * 0.70
Image.fromarray(mp.astype('uint8')).save('/tmp/overlay.png')
