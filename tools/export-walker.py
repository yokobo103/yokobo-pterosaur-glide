"""Astraのリグ付き恐竜から、歩き(Walk)と待機(Idle)を作ってゲーム用のGLBを書き出す。
blender -b --factory-startup <rigged.blend> --python tools/export-walker.py -- <種類> <出力.glb> [三角形の目標]

種類は下の SPECIES の名前(dryo / allo / tricera / brachio)。
Astraのリグには歩きが入っていないので、足のIK操作骨を動かしてここで作る。

共通の決まり
- 前は -X、上は +Z(Astraの全モデル共通)
- 歩きは足踏み(その場)。前進はゲーム側が担当する
- 接地している間、足は一定の速さで後ろへ動く。その速さ(WALK_SPEED)をゲーム側の walk に入れる。
  合っていないと足が地面を滑る
- 材質の色は頂点カラーへ焼き、部品を1つに結合する(1体=描画1回。18頭で864回描いていたのを直した)
"""
import bpy, sys, os, math
from mathutils import Quaternion, Vector

FPS = 24

# 種類ごとの設定。新しい恐竜はここに1つ足す。
#   feet: (操作骨, 位相) の並び。四足は 後左->前左->後右->前右 の順に出す(横歩き)
#   duty: 1周期のうち足が地面に着いている割合(二足0.5 / 四足0.7)
SPECIES = {
    'dryo': dict(  # 全長3.2m 二足
        stride=0.55, cycle=36, lift=0.13, duty=0.5,
        feet=[('CTRL_Foot.L', 0.0), ('CTRL_Foot.R', 0.5)],
        arms=[('Arm.L', 0.0), ('Arm.R', 0.5)], neck=2, tail=4,
        bob=0.030, sway=0.022, tailAmp=[3.5, 5.5, 8.0, 11.0],
    ),
    'allo': dict(  # 全長8.3m 二足の捕食者。歩幅も体も大きい
        stride=1.2, cycle=48, lift=0.24, duty=0.5,
        feet=[('CTRL_Foot.L', 0.0), ('CTRL_Foot.R', 0.5)],
        arms=[('Arm.L', 0.0), ('Arm.R', 0.5)], neck=2, tail=4,
        bob=0.055, sway=0.045, tailAmp=[3.0, 4.5, 6.5, 9.0],
    ),
    'tricera': dict(  # 全長8.0m 四足
        stride=0.9, cycle=48, lift=0.16, duty=0.7,
        feet=[('CTRL_Hind.L.Foot', 0.0), ('CTRL_Fore.L.Foot', 0.25),
              ('CTRL_Hind.R.Foot', 0.5), ('CTRL_Fore.R.Foot', 0.75)],
        arms=[], neck=2, tail=4,
        bob=0.035, sway=0.030, tailAmp=[2.5, 3.5, 4.5, 5.5],
    ),
    'brachio': dict(  # 全長19.6m・高さ12.1m 四足。首は5節
        stride=2.8, cycle=96, lift=0.40, duty=0.7,
        feet=[('CTRL_Hind.L.Foot', 0.0), ('CTRL_Fore.L.Foot', 0.25),
              ('CTRL_Hind.R.Foot', 0.5), ('CTRL_Fore.R.Foot', 0.75)],
        arms=[], neck=5, tail=4,
        bob=0.10, sway=0.075, tailAmp=[2.0, 3.0, 4.0, 5.0],
    ),
}

argv = sys.argv[sys.argv.index('--') + 1:]
kind = argv[0]
out = argv[1]
target_tris = int(argv[2]) if len(argv) > 2 else 6000
S = SPECIES[kind]
STRIDE, CYCLE, LIFT, DUTY = S['stride'], S['cycle'], S['lift'], S['duty']
WALK_SPEED = STRIDE / (DUTY * CYCLE / FPS)     # ゲーム側の walk に入れる値 [m/s]

scn = next((s for s in bpy.data.scenes if s.name.startswith('01')), bpy.data.scenes[0])
bpy.context.window.scene = scn
scn.render.fps = FPS
arm = next(o for o in scn.objects if o.type == 'ARMATURE')
meshes = [o for o in scn.objects if o.type == 'MESH' and o.find_armature() == arm]
print(f'{kind}: armature {arm.name} / meshes {len(meshes)} / walk speed {WALK_SPEED:.3f} m/s', flush=True)

# ---- 骨の向きの違いを吸収する(姿勢の値は骨のローカル空間で持つため) ----
def loc_of(name, delta):
    b = arm.data.bones[name]
    return b.matrix_local.to_quaternion().inverted() @ Vector(delta)

def rot_of(name, axis, angle):
    b = arm.data.bones[name]
    m = b.matrix_local.to_quaternion()
    return m.inverted() @ Quaternion(Vector(axis), angle) @ m

def fcurves_of(act):
    if hasattr(act, 'fcurves') and len(act.fcurves):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out += list(bag.fcurves)
    return out

def key(name, frame, loc=None, rot=None, linear=False):
    if name not in arm.pose.bones:
        return
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
# 位相 p: 0=接地の瞬間 .. DUTY=蹴り出し .. 1=また接地
def foot_at(p):
    if p <= DUTY:                                    # 接地。一定の速さで後ろ(+X)へ
        u = p / DUTY
        return (-STRIDE / 2 + STRIDE * u, 0.0, math.radians(7 - 26 * u))
    q = (p - DUTY) / (1 - DUTY)                      # 振り出し
    return (STRIDE / 2 - STRIDE * (3 * q * q - 2 * q * q * q),
            LIFT * math.sin(math.pi * q),
            math.radians(-19 + 26 * q))

STEPS = 16                                            # 1周期の刻み(細かいほど滑らかだが重い)
walk = new_action('Walk')
for bone, phase0 in S['feet']:
    for i in range(STEPS + 1):
        p = i / STEPS
        f = 1 + p * CYCLE
        pp = (p + phase0) % 1.0
        x, z, pitch = foot_at(pp)
        key(bone, f, loc=(x, 0, z), rot=((0, 1, 0), pitch), linear=(pp <= DUTY))
for bone, phase0 in S['arms']:                        # 前脚(二足のみ)は後脚と逆に振る
    for i in range(5):
        p = i / 4
        f = 1 + p * CYCLE
        sw = math.sin(2 * math.pi * ((p + phase0) % 1.0))
        key(f'{bone}.Upper', f, rot=((0, 1, 0), math.radians(11) * sw))
        key(f'{bone}.Lower', f, rot=((0, 1, 0), math.radians(7) * sw))

nfeet = len(S['feet'])
for i in range(9):
    p = i / 8
    f = 1 + p * CYCLE
    # 体は足が着くたびに沈む。横には1周期に1回ゆれる
    bob = -S['bob'] * 0.7 + S['bob'] * math.cos(2 * math.pi * (nfeet / 2) * p)
    sway = S['sway'] * math.sin(2 * math.pi * p)
    key('Body', f, loc=(0, sway, bob), rot=((0, 1, 0), math.radians(2.0) * math.sin(2 * math.pi * 2 * p)))
    # 尾は根元から先へ遅れて振れる
    for n, amp in enumerate(S['tailAmp'][:S['tail']], start=1):
        key(f'Tail.0{n}', f, rot=((0, 0, 1), math.radians(amp) * math.sin(2 * math.pi * (p - 0.09 * n))))
    # 首は体のゆれを打ち消す向きに。節が多いほど1節あたりは小さく
    for n in range(1, S['neck'] + 1):
        amp = 3.0 / S['neck']
        key(f'Neck.0{n}', f, rot=((0, 0, 1), math.radians(-amp) * math.sin(2 * math.pi * (p - 0.05 * n))))
    key('Head', f, rot=((0, 1, 0), math.radians(-2.0) * math.cos(2 * math.pi * 2 * p)))

# ---- 待機 ----
IDLE = 72
idle = new_action('Idle')
for i in range(9):
    p = i / 8
    f = 1 + p * IDLE
    key('Body', f, loc=(0, 0, S['bob'] * 0.35 * math.sin(2 * math.pi * 2 * p)))     # 呼吸
    for n in range(1, S['neck'] + 1):
        key(f'Neck.0{n}', f, rot=((0, 1, 0), math.radians(2.0 / S['neck']) * math.sin(2 * math.pi * p)))
    key('Head', f, rot=((0, 1, 0), math.radians(-1.5) * math.sin(2 * math.pi * p + 0.6)))
    for n, amp in enumerate(S['tailAmp'][:S['tail']], start=1):
        key(f'Tail.0{n}', f, rot=((0, 0, 1), math.radians(amp * 0.45) * math.sin(2 * math.pi * p - n * 0.2)))

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

# ---- 材質の色を頂点カラーへ焼いて、部品を1つにまとめる ----
PALETTE = 'game_palette'
def base_color(mat):
    if mat and mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                inp = n.inputs['Base Color']
                if inp.is_linked:
                    return None            # 頂点カラーがつながっている = そのまま使う
                return tuple(inp.default_value)
    return (0.5, 0.5, 0.5, 1.0)

flat = bpy.data.materials.new(f'{kind} flat')
flat.use_nodes = True
bsdf = next(n for n in flat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
attr = flat.node_tree.nodes.new('ShaderNodeVertexColor'); attr.layer_name = PALETTE
flat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.85

for o in meshes:
    me = o.data
    src = me.color_attributes.active_color
    keep = {}
    if src is not None and src.domain == 'CORNER' and src.name != PALETTE:
        keep = {i: tuple(src.data[i].color) for i in range(len(src.data))}
    cols = {i: base_color(sl.material) for i, sl in enumerate(o.material_slots)}
    if PALETTE not in me.color_attributes:
        me.color_attributes.new(name=PALETTE, type='FLOAT_COLOR', domain='CORNER')
    ca = me.color_attributes[PALETTE]
    me.color_attributes.active_color = ca
    for poly in me.polygons:
        c = cols.get(poly.material_index)
        for li in poly.loop_indices:
            ca.data[li].color = keep.get(li, (0.5, 0.5, 0.5, 1.0)) if c is None else c
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
print('joined into', tris_of(join_to), 'tris /', len(join_to.data.materials), 'material', flush=True)

for o in scn.objects:
    o.select_set(False)
arm.select_set(True)
join_to.select_set(True)
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
