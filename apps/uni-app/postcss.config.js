const path = require('path')

module.exports = {
  parser: require('postcss-comment'),
  plugins: [
    require('postcss-import')({
      resolve(id) {
        if (id.startsWith('~@/')) return path.resolve(process.env.UNI_INPUT_DIR, id.slice(3))
        if (id.startsWith('@/')) return path.resolve(process.env.UNI_INPUT_DIR, id.slice(2))
        return id
      }
    }),
    require('autoprefixer')(),
    require('@dcloudio/vue-cli-plugin-uni/packages/postcss')
  ]
}
