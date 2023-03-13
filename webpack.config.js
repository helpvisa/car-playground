const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  module: {
    rules: [
      // css loader
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader'
        ]
      },
      // gltf loader
      {
        test: /\.(gltf)$/,
        loader: "gltf-loader",
        options: {
          filePath: "models"
        }
      },
      // asset / image loader
      {
        test: /\.(bin|png|jpe?g)$/,
        type: "asset/resource"
      }
    ]
  },
  mode: 'production',
  entry: {
    main: path.resolve(__dirname, '/src/js/index.js')
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: "/",
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'src/index.html'
    })
  ]
}