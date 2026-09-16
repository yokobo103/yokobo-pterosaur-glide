import { defineConfig } from 'vite';

export default defineConfig({
  // 相対パスで吐くので GitHub Pages のサブパスでもそのまま動く
  base: './',
});
