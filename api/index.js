try {
  module.exports = require('../apps/api/dist/vercel.js').default;
} catch (error) {
  module.exports = function missingApiBundle(_req, res) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        code: 'API_NOT_BUILT',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  };
}
