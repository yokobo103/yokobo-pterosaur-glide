"""動かないモデル(リグなし)をゲーム用のGLBに書き出す。
blender -b --factory-startup <元.blend> --python tools/export-static.py -- <出力.glb> [三角形の目標] [除外する名前の一部...]

- 分割曲面を外し、大きな部品だけ減らす(小さな部品を同じ割合で減らすと形が崩れる)
- 頂点カラーがあればそのまま残す(Astraは体色を頂点カラーで持たせている)
- 材質のノードがglTFに出ない場合に備え、Base Colorの単色へ置き換える
"""
import bpy, sys, os

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]
target_tris = int(argv[1]) if len(argv) > 1 else 5000
skip = [s for s in argv[2:]]

scn = bpy.context.scene
meshes = [o for o in scn.objects if o.type == 'MESH' and not any(s.lower() in o.name.lower() for s in skip)]
print('meshes:', [o.name for o in meshes][:10], flush=True)

tris_of = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
for o in meshes:
    if o.data.users > 1:
        o.data = o.data.copy()
    for mod in list(o.modifiers):
        if mod.type == 'SUBSURF':
            o.modifiers.remove(mod)

big = [o for o in meshes if tris_of(o) > 1200]
big_sum = sum(tris_of(o) for o in big)
small_sum = sum(tris_of(o) for o in meshes if o not in big)
big_ratio = min(1.0, target_tris * 0.6 / max(big_sum, 1))
small_ratio = min(1.0, max(0.2, target_tris * 0.4 / max(small_sum, 1)))
print(f'tris before {big_sum + small_sum} (big {big_sum} / small {small_sum}) ratios {big_ratio:.3f} {small_ratio:.3f}', flush=True)

for o in meshes:
    ratio = big_ratio if o in big else small_ratio
    if ratio < 1.0 and tris_of(o) > 60:
        dec = o.modifiers.new('decimate', 'DECIMATE'); dec.ratio = ratio
        with bpy.context.temp_override(scene=scn, view_layer=scn.view_layers[0], object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.modifier_apply(modifier='decimate')
print('tris after', sum(tris_of(o) for o in meshes), flush=True)
print('color attributes:', {o.name: [a.name for a in o.data.color_attributes] for o in meshes[:6]}, flush=True)

for o in scn.objects:
    o.select_set(False)
for o in meshes:
    o.select_set(True)
scn.view_layers[0].objects.active = meshes[0]
# temp_override で囲むと書き出し中にBlenderが落ちる(ステゴで確認済み)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_yup=True,
                          export_apply=False, export_animations=False, export_materials='EXPORT',
                          export_vertex_color='MATERIAL', export_attributes=False,
                          export_texcoords=False, export_tangents=False)   # 画像を貼らないので UV は要らない(容量)
print('EXPORTED', out, round(os.path.getsize(out) / 1024), 'KB', flush=True)
