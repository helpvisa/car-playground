const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    main: './src/js/index.js'
  },
  output: {
    filename: 'bundle.js',
    path: __dirname,
  },
  devtool: 'inline-source-map',
  devServer: {
    static: {
      directory: __dirname,
    },
    port: 3000,
    host: 'localhost',
    hot: true,
    open: true,
  }
}