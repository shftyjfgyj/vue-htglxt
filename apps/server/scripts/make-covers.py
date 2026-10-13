"""
生成 6 个分类的抽象封面图（每类 3 个变体，共 18 张）。

背景：本机图像服务（GPT / Grok）未登录，无法生成真实摄影作品。
因此这里用程序化方式做「抽象编辑风格」封面：渐变底 + 柔光色块 + 几何细环 + 斜向光带 + 噪点暗角。
不冒充照片，但成体系、有设计感，配色沿用站点暖色调。

输出：apps/web/public/seed/cover-<key>-<n>.jpg（前端静态目录，随前端一起发布）
"""
import math
import os
import zlib
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

WIDTH, HEIGHT = 1536, 1024
# 输出到「前端静态目录」而不是后端的 uploads：
#   - apps/server/uploads/ 在 .gitignore 里，进不了仓库，部署后后端根本没有这些文件
#   - 封面是随应用发布的演示素材，不是用户上传物，理应跟着前端走
#   - 放在 public/ 下，开发（Vite）与生产（Cloudflare Pages / nginx）都由前端直接服务，
#     既不用改 vite 代理，也不占用对象存储
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'web', 'public', 'seed')

PALETTES = {
    'travel':  ((24, 96, 124),  (231, 196, 148), [(255, 238, 205), (96, 182, 205), (255, 206, 150)]),
    'life':    ((242, 226, 208), (172, 100, 72),  [(255, 246, 232), (216, 152, 112), (255, 222, 192)]),
    'emotion': ((178, 98, 120),  (66, 44, 70),    [(242, 172, 172), (152, 92, 142), (255, 202, 192)]),
    'food':    ((198, 128, 58),  (112, 42, 28),   [(255, 208, 122), (232, 122, 72), (255, 238, 192)]),
    'reading': ((70, 82, 118),   (214, 203, 188), [(182, 196, 236), (255, 236, 202), (122, 132, 176)]),
    'career':  ((58, 72, 86),    (198, 158, 38),  [(255, 222, 142), (122, 152, 182), (232, 202, 152)]),
}


def stable_seed(*parts):
    """用 crc32 而不是内置 hash()：hash() 对字符串每个进程都不同，无法复现"""
    return zlib.crc32('|'.join(str(p) for p in parts).encode('utf-8'))


def linear_gradient(w, h, c1, c2, angle_deg):
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    angle = math.radians(angle_deg)
    projection = xs * math.cos(angle) + ys * math.sin(angle)
    t = (projection - projection.min()) / (projection.max() - projection.min())
    t = t * t * (3 - 2 * t)          # 平滑过渡
    t = t[..., None]
    return np.array(c1, dtype=np.float32) * (1 - t) + np.array(c2, dtype=np.float32) * t


def to_image(array):
    return Image.fromarray(np.clip(array, 0, 255).astype(np.uint8), 'RGB')


def add_blobs(base, colors, rng, count=4):
    """大面积柔光色块：先画椭圆再重度模糊，形成雾一样的层次"""
    h, w = base.shape[:2]
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for _ in range(count):
        color = rng.choice(colors)
        rx = rng.uniform(0.20, 0.44) * w
        ry = rng.uniform(0.20, 0.44) * h
        cx = rng.uniform(-0.05, 1.05) * w
        cy = rng.uniform(-0.05, 1.05) * h
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(*color, rng.randint(80, 155)))
    layer = layer.filter(ImageFilter.GaussianBlur(radius=w * 0.11))
    return np.asarray(Image.alpha_composite(to_image(base).convert('RGBA'), layer).convert('RGB'), dtype=np.float32)


def add_rings(base, rng, count=3):
    """几何细环：给雾面一点结构和「被人设计过」的感觉"""
    h, w = base.shape[:2]
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for _ in range(count):
        radius = rng.uniform(0.16, 0.46) * w
        cx = rng.uniform(0.10, 0.95) * w
        cy = rng.uniform(0.10, 0.95) * h
        width = rng.randint(2, 4)
        alpha = rng.randint(38, 78)
        # 一半用亮色、一半用暗色，避免整体发灰
        tone = (255, 255, 255) if rng.random() < 0.65 else (20, 20, 25)
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=(*tone, alpha), width=width)
    layer = layer.filter(ImageFilter.GaussianBlur(radius=1.3))
    return np.asarray(Image.alpha_composite(to_image(base).convert('RGBA'), layer).convert('RGB'), dtype=np.float32)


def add_light_bands(base, rng, count=2):
    """斜向光带：打破纯渐变的呆板"""
    h, w = base.shape[:2]
    for _ in range(count):
        layer = Image.new('L', (w, h), 0)
        draw = ImageDraw.Draw(layer)
        offset = rng.uniform(-0.3, 0.7) * w
        band = rng.uniform(0.04, 0.10) * w
        skew = rng.uniform(-0.5, 0.5) * w
        draw.polygon(
            [(offset, 0), (offset + band, 0), (offset + band + skew, h), (offset + skew, h)],
            fill=rng.randint(34, 68),
        )
        layer = layer.filter(ImageFilter.GaussianBlur(radius=w * 0.05))
        mask = np.asarray(layer, dtype=np.float32)[..., None] / 255.0
        base = base * (1 - mask) + 255.0 * mask * 0.92
    return base


def add_grain_and_vignette(base, np_rng):
    h, w = base.shape[:2]
    base = base + np_rng.normal(0, 3.0, (h, w, 1)).astype(np.float32)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = (xs - w / 2) / (w / 2)
    ny = (ys - h / 2) / (h / 2)
    radius = np.sqrt(nx ** 2 + ny ** 2)
    return base * np.clip(1.06 - 0.30 * (radius ** 2.4), 0.6, 1.0)[..., None]


def build(key, rng, np_rng):
    c1, c2, blob_colors = PALETTES[key]
    base = linear_gradient(WIDTH, HEIGHT, c1, c2, angle_deg=rng.choice([16, 30, 46, 64]))
    base = add_blobs(base, blob_colors, rng)
    base = add_light_bands(base, rng, count=rng.randint(1, 2))
    base = add_rings(base, rng, count=rng.randint(2, 4))
    base = add_grain_and_vignette(base, np_rng)
    return to_image(base)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    total = 0
    for key in PALETTES:
        for index in range(1, 4):
            seed = stable_seed(key, index)
            image = build(key, random.Random(seed), np.random.default_rng(seed))
            path = os.path.join(OUT_DIR, f'cover-{key}-{index}.jpg')
            image.save(path, 'JPEG', quality=88, optimize=True, progressive=True)
            total += 1
            print(f'  {os.path.basename(path)}  {os.path.getsize(path) // 1024} KB')
    print(f'\n共生成 {total} 张封面 -> {os.path.normpath(OUT_DIR)}')


if __name__ == '__main__':
    main()
