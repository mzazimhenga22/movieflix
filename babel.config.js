module.exports = function (api) {
  api.cache.using(() => process.env.NODE_ENV);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            "@": "./",
            "@p-stream": "./providers-temp/src"
          },
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
