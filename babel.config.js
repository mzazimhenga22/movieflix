module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@': './',
            '@p-stream': './providers-temp/src',
          },
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
