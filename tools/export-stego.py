"""Astraのステゴサウルス(リグ版)から、ゲーム用のGLBを書き出す。
blender -b --factory-startup <Stegosaurus_S01_rigged.blend> --python tools/export-stego.py -- <出力.glb> [三角形の目標]

- 3つのシーンのうち「01 NEUTRAL」の骨格と体を使い、待機(Idle)と歩き(Walk)の2つの動きをNLAに積んで書き出す
- 歩きの前進(CTRL_Root の移動)は取り除く。ゲーム側で動かすため、残すと二重に進み、周期ごとに後ろへ戻る
- 材質はBlender専用のノードで組まれていてglTFに色が出ないので、名前ごとに単色の材質に置き換える
- 分割曲面を外し、減らす(1体11万三角形は群れで置くには重い)
"""
import bpy, sys, os

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]
target_tris = int(argv[1]) if len(argv) > 1 else 9000
MODE = argv[2] if len(argv) > 2 else 'NLA_TRACKS'   # NLA_TRACKS / ACTIONS / NONE

scn = next(s for s in bpy.data.scenes if s.name.startswith('01'))
arm = next(o for o in scn.objects if o.type == 'ARMATURE')
meshes = [o for o in scn.objects if o.type == 'MESH' and o.find_armature() == arm]
print('armature', arm.name, 'meshes', len(meshes))

# 動き: IdleとWalkをNLAトラックに積む
idle = next(a for a in bpy.data.actions if 'Idle' in a.name)
walk = next(a for a in bpy.data.actions if 'walk' in a.name.lower())
# 歩きの前進を消す(足踏みにする)
removed = 0
for fc in list(walk.fcurves) if hasattr(walk, 'fcurves') else []:
    if 'CTRL_Root' in fc.data_path and fc.data_path.endswith('location'):
        walk.fcurves.remove(fc); removed += 1
if not hasattr(walk, 'fcurves'):
    # Blender 5系のレイヤー付きアクション
    for layer in walk.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in list(bag.fcurves):
                    if 'CTRL_Root' in fc.data_path and fc.data_path.endswith('location'):
                        bag.fcurves.remove(fc); removed += 1
print('removed root travel curves:', removed)

ad = arm.animation_data or arm.animation_data_create()
ad.action = None
for name, act in (('Idle', idle), ('Walk', walk)):
    tr = ad.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, int(act.frame_range[0]), act)
    st.name = name
    tr.mute = False

# 材質を単色に
COLORS = {
    'Hide': (0.30, 0.31, 0.22), 'Plates': (0.46, 0.22, 0.12), 'Horn': (0.55, 0.45, 0.30),
    'Eye': (0.55, 0.32, 0.06), 'Pupil': (0.02, 0.02, 0.02), 'Recesses': (0.10, 0.08, 0.07),
}
flat = {}
for key, col in COLORS.items():
    m = bpy.data.materials.new(f'Stego {key}')
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*col, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.85
    flat[key] = m

total_before = total_after = 0
for o in meshes:
    for mod in list(o.modifiers):
        if mod.type == 'SUBSURF':
            o.modifiers.remove(mod)
    for i, slot in enumerate(o.material_slots):
        if slot.material:
            key = next((k for k in COLORS if slot.material.name.startswith(k)), 'Hide')
            o.material_slots[i].material = flat[key]
    total_before += sum(len(p.vertices) - 2 for p in o.data.polygons)

# 3つのシーンで形のデータを共有しているので、書き出す分だけ複製してから減らす
for o in meshes:
    if o.data.users > 1:
        o.data = o.data.copy()
tris_of = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
# 小さな背板やスパイクまで同じ割合で減らすと形が崩れるので、大きな部品だけ減らす
big = [o for o in meshes if tris_of(o) > 1500]
small_sum = sum(tris_of(o) for o in meshes if o not in big)
big_sum = sum(tris_of(o) for o in big)
# 胴体(1部品で7.6万)は目標の45%、小さな部品(47部品で3.4万)は残りに収まるように減らす
big_ratio = min(1.0, target_tris * 0.45 / max(big_sum, 1))
small_ratio = min(1.0, max(0.15, target_tris * 0.55 / max(small_sum, 1)))
print('tris before', total_before, 'big', big_sum, 'small', small_sum, 'ratios', round(big_ratio, 4), round(small_ratio, 4))
for o in meshes:
    ratio = big_ratio if o in big else small_ratio
    if ratio < 1.0 and tris_of(o) > 60:
        dec = o.modifiers.new('decimate', 'DECIMATE'); dec.ratio = ratio
        # 骨の変形より前で減らす(ウェイトは保たれる)
        o.modifiers.move(o.modifiers.find('decimate'), 0)
        with bpy.context.temp_override(scene=scn, view_layer=scn.view_layers[0], object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.modifier_apply(modifier='decimate')
    total_after += sum(len(p.vertices) - 2 for p in o.data.polygons)
print('tris after', total_after, flush=True)

# ---- 材質の色を頂点カラーへ焼いて、48個の部品を1つにまとめる ----
# (部品のままだと1体48回描くことになり、18頭で864回。実測でこれが描画回数の88%だった)
PALETTE = 'S01_palette'
for o in meshes:
    me = o.data
    if PALETTE not in me.color_attributes:
        me.color_attributes.new(name=PALETTE, type='FLOAT_COLOR', domain='CORNER')
    ca = me.color_attributes[PALETTE]
    me.color_attributes.active_color = ca
    cols = {}
    for i, sl in enumerate(o.material_slots):
        key = next((k for k in COLORS if sl.material and sl.material.name.endswith(k)), 'Hide')
        cols[i] = (*COLORS[key], 1.0)
    for poly in me.polygons:
        c = cols.get(poly.material_index, (0.3, 0.31, 0.22, 1.0))
        for li in poly.loop_indices:
            ca.data[li].color = c

one = bpy.data.materials.new('Stego flat')
one.use_nodes = True
bsdf = next(n for n in one.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
attr = one.node_tree.nodes.new('ShaderNodeVertexColor'); attr.layer_name = PALETTE
one.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.85
for o in meshes:
    o.data.materials.clear()
    o.data.materials.append(one)

join_to = max(meshes, key=tris_of)
for o in scn.objects:
    o.select_set(False)
for o in meshes:
    o.select_set(True)
scn.view_layers[0].objects.active = join_to
with bpy.context.temp_override(scene=scn, view_layer=scn.view_layers[0], active_object=join_to,
                               object=join_to, selected_objects=meshes, selected_editable_objects=meshes):
    bpy.ops.object.join()
meshes = [join_to]
if not any(m.type == 'ARMATURE' for m in join_to.modifiers):
    md = join_to.modifiers.new('Armature', 'ARMATURE'); md.object = arm
print('joined into', join_to.name, tris_of(join_to), 'tris /', len(join_to.data.materials), 'material', flush=True)
print('STEP select', flush=True)

for o in scn.objects:
    o.select_set(False)
arm.select_set(True)
for o in meshes:
    o.select_set(True)
print('STEP active', bpy.context.scene.name, flush=True)
scn.view_layers[0].objects.active = arm
print('STEP export', flush=True)
# temp_override で囲むと書き出し中にBlenderが落ちた(囲まない書き出しは成功)。起動時のシーンが 01 なのでそのまま呼ぶ
assert bpy.context.scene == scn
if True:
    bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_yup=True,
                              export_apply=False, export_animations=(MODE != 'NONE'), export_animation_mode=(MODE if MODE != 'NONE' else 'ACTIONS'),
                              export_force_sampling=True, export_frame_step=1, export_materials='EXPORT',
                              export_vertex_color='MATERIAL', export_attributes=False,
                              export_texcoords=False, export_tangents=False,
                              export_skins=True, export_morph=False, export_def_bones=False)
print('EXPORTED', out, round(os.path.getsize(out) / 1024), 'KB')
