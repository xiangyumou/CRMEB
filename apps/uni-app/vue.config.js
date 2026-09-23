module.exports = {
	productionSourceMap: false, // 生产打包时不输出map文件，增加打包速度
	configureWebpack: config => {
		config.resolve = config.resolve || {}
		config.resolve.fallback = {
			...(config.resolve.fallback || {}),
			crypto: require.resolve('crypto-browserify'),
			stream: require.resolve('stream-browserify'),
			vm: require.resolve('vm-browserify')
		}
		if (process.env.NODE_ENV === 'production' && config.optimization.minimizer[0].options.terserOptions) {
			config.optimization.minimizer[0].options.terserOptions.compress.warnings = false
			config.optimization.minimizer[0].options.terserOptions.compress.drop_console = true
			config.optimization.minimizer[0].options.terserOptions.compress.drop_debugger = true
			config.optimization.minimizer[0].options.terserOptions.compress.pure_funcs = ['console.log']
		}
	}
}
