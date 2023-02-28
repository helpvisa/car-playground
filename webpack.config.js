const path = require('path');

module.exports = {
  entry: {
    main: './src/js/index.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist')
  },
  mode: 'production'
}