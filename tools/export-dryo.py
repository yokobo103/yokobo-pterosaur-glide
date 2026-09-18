"""Astraのドリオサウルス(リグ版・赤茶)から、ゲーム用のGLBを書き出す。
blender -b --factory-startup <Dryosaurus_D01_rigged.blend> --python tools/export-dryo.py -- <出力.glb> [三角形の目標]

Astraのリグには待機・歩きの動きが入っていない(READMEに「歩行サイクルは未実装」)ので、
足のIK操作骨(CTRL_Foot.L/R)を使って、ここで Idle と Walk を作ってから書き出す。

- 前は -X、上は +Z。歩きは足踏み(その場)で作り、前進はゲーム側が担当する
- 接地している間、足は一定の速さで後ろへ動く。その速さ(WALK_SPEED)をゲーム側の歩く速さに使う。
  合っていないと足が地面を滑る(ステゴで一度やらかした)
- 頂点カラーの体色はそのまま残す。UVは使わないので落とす(容量)
"""
import bpy, sys, os, math
from mathutils import Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]
target_tris = int(argv[1]) if len(argv) > 1 else 6000

FPS = 24
STRIDE = 0.55          # 1歩の歩幅 [m](体長3.2m・脚の長さ0.8mに対して)
CYCLE = 36             # 1周期(2歩)のコマ数 -> 1.5秒
LIFT = 0.13            # 振り出した足の上がる高さ [m]
WALK_SPEED = 2 * STRIDE / (CYCLE / FPS)      # 0.733 m/s。ゲーム側の walk に入れる値

scn = next(s for s in bpy.data.scenes if s.name.startswith('01'))
bpy.context.window.scene = scn
scn.render.fps = FPS
arm = next(o for o in scn.objects if o.type == 'ARMATURE')
meshes = [o for o in scn.objects if o.type == 'MESH' and o.find_armature() == arm]
print('armature', arm.name, 'meshes', len(meshes), 'walk speed', round(WALK_SPEED, 3), flush=True)

# ---- 骨の向きの違いを吸収する(姿勢の値は骨のローカル空間で持つため) ----
def loc_of(name, delta):
    """骨格空間での移動 -> その骨のローカルな location"""
    b = arm.data.bones[name]
    return b.matrix_local.to_quaternion().inverted() @ Vector(delta)

def rot_of(name, axis, angle):
    """骨格空間の軸まわりの回転 -> その骨のローカルな rotation_quaternion"""
    b = arm.data.bones[name]
    m = b.matrix_local.to_quaternion()
    return m.inverted() @ Quaternion(Vector(axis), angle) @ m

def key(name, frame, loc=None, rot=None, linear=False):
    pb = arm.pose.bones[name]
    if loc is not None:
        pb.location = loc_of(name, loc)
        pb.keyframe_insert('location', frame=frame)
    if rot is not None:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = rot_of(name, rot[0], rot[1])
        pb.keyframe_insert('rotation_quaternion', frame=frame)
    if linear:
        for fc in fcurves_of(arm.animation_data.action):
            if f'"{name}"' in fc.data_path:
                for k in fc.keyframe_points:
                    if abs(k.co[0] - frame) < 0.01:
                        k.interpolation = 'LINEAR'

def fcurves_of(act):
    if hasattr(act, 'fcurves') and len(act.fcurves):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out += list(bag.fcurves)
    return out

def new_action(name):
    ad = arm.animation_data or arm.animation_data_create()
    act = bpy.data.actions.new(name)
    ad.action = act
    if hasattr(ad, 'action_slot') and len(act.slots) == 0:
        ad.action_slot = act.slots.new(id_type='OBJECT', name=arm.name)
    for pb in arm.pose.bones:       # 前の動きを持ち越さない
        pb.location = (0, 0, 0); pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0)
    return act

# ---- 歩き ----
# 位相 p: 0=接地の瞬間、0.5=蹴り出し、0.5〜1=振り出し
def foot_at(p):
    if p <= 0.5:                              # 接地。一定の速さで後ろ(+X)へ
        x = -STRIDE / 2 + STRIDE * (p / 0.5)
        z = 0.0
        pitch = math.radians(7 - 26 * (p / 0.5))      # かかとから着き、つま先で蹴る
    else:                                     # 振り出し
        q = (p - 0.5) / 0.5
        x = STRIDE / 2 - STRIDE * (3 * q * q - 2 * q * q * q)
        z = LIFT * math.sin(math.pi * q)
        pitch = math.radians(-19 + 26 * q)
    return x, z, pitch

walk = new_action('Walk')
for side, phase0 in (('L', 0.0), ('R', 0.5)):
    for i in range(9):                        # 8等分 + 折り返し
        p = i / 8
        f = 1 + p * CYCLE
        x, z, pitch = foot_at((p + phase0) % 1.0)
        stance = ((p + phase0) % 1.0) <= 0.5
        key(f'CTRL_Foot.{side}', f, loc=(x, 0, z), rot=((0, 1, 0), pitch), linear=stance)
    # 前脚は同じ側の後脚と逆に振る
    for i in range(5):
        p = i / 4
        f = 1 + p * CYCLE
        sw = math.sin(2 * math.pi * ((p + phase0) % 1.0))
        key(f'Arm.{side}.Upper', f, rot=((0, 1, 0), math.radians(11) * sw))
        key(f'Arm.{side}.Lower', f, rot=((0, 1, 0), math.radians(7) * sw))

for i in range(9):
    p = i / 8
    f = 1 + p * CYCLE
    # 体は1周期に2回沈む(接地のたび)。横には1回ゆれる
    bob = -0.022 + 0.030 * math.cos(2 * math.pi * 2 * p)
    sway = 0.022 * math.sin(2 * math.pi * p)
    key('Body', f, loc=(0, sway, bob), rot=((0, 1, 0), math.radians(2.5) * math.sin(2 * math.pi * 2 * p)))
    # 尾は根元から先へ遅れて振れる。振り幅は先ほど大きい
    for n, (amp, lag) in enumerate([(3.5, 0.0), (5.5, 0.09), (8.0, 0.18), (11.0, 0.27)], start=1):
        key(f'Tail.0{n}', f, rot=((0, 0, 1), math.radians(amp) * math.sin(2 * math.pi * (p - lag))))
    # 首と頭は体のゆれを打ち消す向きに少しだけ
    key('Neck.01', f, rot=((0, 0, 1), math.radians(-2.5) * math.sin(2 * math.pi * p)))
    key('Neck.02', f, rot=((0, 1, 0), math.radians(1.8) * math.cos(2 * math.pi * 2 * p)))
    key('Head', f, rot=((0, 1, 0), math.radians(-2.2) * math.cos(2 * math.pi * 2 * p)))

# ---- 待機 ----
IDLE = 72
idle = new_action('Idle')
for i in range(9):
    p = i / 8
    f = 1 + p * IDLE
    key('Body', f, loc=(0, 0, 0.012 * math.sin(2 * math.pi * 2 * p)))      # 呼吸
    key('Neck.02', f, rot=((0, 1, 0), math.radians(2.0) * math.sin(2 * math.pi * p)))
    key('Head', f, rot=((0, 1, 0), math.radians(-1.5) * math.sin(2 * math.pi * p + 0.6)))
    for n, amp in enumerate([1.5, 2.5, 3.5, 4.5], start=1):
        key(f'Tail.0{n}', f, rot=((0, 0, 1), math.radians(amp) * math.sin(2 * math.pi * p - n * 0.2)))

print('walk fcurves', len(fcurves_of(walk)), 'idle fcurves', len(fcurves_of(idle)), flush=True)

# ---- NLAに積む(glTFのクリップになる) ----
ad = arm.animation_data
ad.action = None
for name, act in (('Idle', idle), ('Walk', walk)):
    tr = ad.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, 1, act)
    st.name = name
    tr.mute = False

# ---- 軽くする(骨の変形より前で減らす。ウェイトは保たれる) ----
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
print(f'tris before {big_sum + small_sum} ratios {big_ratio:.3f} {small_ratio:.3f}', flush=True)
for o in meshes:
    ratio = big_ratio if o in big else small_ratio
    if ratio < 1.0 and tris_of(o) > 60:
        dec = o.modifiers.new('decimate', 'DECIMATE'); dec.ratio = ratio
        o.modifiers.move(o.modifiers.find('decimate'), 0)
        with bpy.context.temp_override(scene=scn, view_layer=scn.view_layers[0], object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.modifier_apply(modifier='decimate')
print('tris after', sum(tris_of(o) for o in meshes), flush=True)

# ---- 材質の色を頂点カラーへ焼いて、18個の部品を1つにまとめる ----
# (部品のままだと1体18回描くことになり、18頭で324回。群れにすると効いてくる)
PALETTE = 'D01_palette'
def base_color(mat):
    if mat and mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                inp = n.inputs['Base Color']
                if inp.is_linked:
                    return None            # 頂点カラーがつながっている = そのまま使う
                return tuple(inp.default_value)
    return (0.5, 0.5, 0.5, 1.0)

flat = bpy.data.materials.new('D01 flat')
flat.use_nodes = True
bsdf = next(n for n in flat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
attr = flat.node_tree.nodes.new('ShaderNodeVertexColor'); attr.layer_name = PALETTE
flat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.85

for o in meshes:
    me = o.data
    if PALETTE not in me.color_attributes:
        me.color_attributes.new(name=PALETTE, type='FLOAT_COLOR', domain='CORNER')
    ca = me.color_attributes[PALETTE]
    me.color_attributes.active_color = ca
    cols = {i: base_color(sl.material) for i, sl in enumerate(o.material_slots)}
    for poly in me.polygons:
        c = cols.get(poly.material_index)
        if c is None:
            continue                        # 体はもともとの頂点カラー(赤茶・砂色)を残す
        for li in poly.loop_indices:
            ca.data[li].color = c
    o.data.materials.clear()
    o.data.materials.append(flat)

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

for o in scn.objects:
    o.select_set(False)
arm.select_set(True)
for o in meshes:
    o.select_set(True)
scn.view_layers[0].objects.active = arm
assert bpy.context.scene == scn
# temp_override で囲むと書き出し中にBlenderが落ちる(ステゴで確認済み)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_yup=True,
                          export_apply=False, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_frame_step=1, export_materials='EXPORT',
                          export_vertex_color='MATERIAL', export_attributes=False,
                          export_texcoords=False, export_tangents=False,
                          export_skins=True, export_morph=False, export_def_bones=False)
print('WALK_SPEED', round(WALK_SPEED, 4))
print('EXPORTED', out, round(os.path.getsize(out) / 1024), 'KB')
