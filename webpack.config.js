const path = require('path');

module.exports = {
  mode: 'production',
  entry: {
    main: './src/js/index.js'
  },
  output: {
    filename: 'bundle.js',
    path: __dirname,
  }
}