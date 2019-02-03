const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "development",
  entry: {
    background: "./src/background.ts"
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name]-bundle.js"
  },
  plugins: [
    new CopyWebpackPlugin(
      [
        { from: "static", to: "." } // to is relative to outpath
      ],
      {}
    )
  ]
};
