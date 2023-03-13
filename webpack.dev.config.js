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
  mode: 'development',
  entry: {
    main: path.resolve(__dirname, '/src/js/index.js')
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: "/",
  },
  devtool: 'inline-source-map',
  devServer: {
    static: {
      directory: path.resolve(__dirname, 'dist')
    },
    port: 3000,
    host: 'localhost',
    hot: true,
    open: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'src/index.html'
    })
  ],
  // warning filter (suppresses glTF warning)
  ignoreWarnings: [
    {
      message: /Prefer using local or remote URIs instead for better performance on the web. If you want to use self-contained files, consider using the `.glb` format./
    }
  ]
}