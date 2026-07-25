const express = require('express');
const { applyStepOverrides, clearDiscoverySession, getDiscoverySession, getHarFilePath, startDiscovery, stopDiscovery } = require('../services/discoveryService');

const router = express.Router();

router.post('/start', async (req, res, next) => {
  try {
    const session = await startDiscovery({
      baseUrl: req.body && req.body.baseUrl,
      manualTestCase: req.body && (req.body.manualTestCase || req.body.manual || req.body.text || '')
    });
    res.json(session);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return next(error);
  }
});

router.post('/stop', async (req, res, next) => {
  try {
    const session = await stopDiscovery();
    res.json(session);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return next(error);
  }
});

router.get('/session', (req, res) => {
  return res.json(getDiscoverySession());
});

router.get('/har/download', (req, res) => {
  const harPath = getHarFilePath();
  if (!harPath) {
    return res.status(404).json({ error: 'No HAR file available' });
  }

  return res.download(harPath);
});

router.post('/clear', async (req, res) => {
  return res.json(await clearDiscoverySession());
});

router.post('/session/overrides', (req, res) => {
  const overrides = (req.body && req.body.overrides) || [];
  return res.json(applyStepOverrides(overrides));
});

module.exports = router;
