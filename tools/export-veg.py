"""氾濫原ジェネレーターの原型メッシュから、木と岩のGLBを書き出す。近景用(元のまま)と遠景用(減らした版)。
blender -b --factory-startup <Jurassic_Floodplain_Generator.blend> --python tools/export-veg.py -- <出力フォルダ>
"""
import bpy, sys, os, mathutils

out = sys.argv[sys.argv.index('--') + 1]
os.makedirs(out, exist_ok=True)
ASSETS = {
    'conifer': ('JF Asset | Conifer', 0.10),
    'ginkgo':  ('JF Asset | Ginkgo', 0.08),
    'rock':    ('JF Asset | Rock', 1.0),
}
scn = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
for key, (name, far_ratio) in ASSETS.items():
    src = bpy.data.objects[name]
    for lod, ratio in (('lod0', 1.0), ('lod1', far_ratio)):
        ob = src.copy(); ob.data = src.data.copy()
        scn.collection.objects.link(ob)
        ob.hide_viewport = False; ob.hide_render = False; ob.hide_set(False)
        if ratio < 1.0:
            m = ob.modifiers.new('decimate', 'DECIMATE'); m.ratio = ratio
        dg.update()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        me.transform(ob.matrix_world)
        # 根元を原点へ(xyは中心、高さは一番下)
        xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
        me.transform(mathutils.Matrix.Translation((-(min(xs)+max(xs))/2, -(min(ys)+max(ys))/2, -min(zs))))
        for sl in src.material_slots:
            pass
        tmp = bpy.data.objects.new(f'{key}_{lod}', me)
        scn.collection.objects.link(tmp)
        bpy.data.objects.remove(ob)
        for o in scn.objects: o.select_set(False)
        tmp.select_set(True); bpy.context.view_layer.objects.active = tmp
        path = os.path.join(out, f'{key}_{lod}.glb')
        bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_apply=True, export_yup=True,
                                  export_materials='EXPORT', export_animations=False)
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        print(f'EXPORT {key}_{lod}: tris={tris} height={max(zs)-min(zs):.2f}m size={os.path.getsize(path)/1024:.0f}KB')
        bpy.data.objects.remove(tmp)
