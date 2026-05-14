/**
 * testRoutes.js
 * --------------------------------------------------------------------------
 * Test stsenariylarini panel orqali ishga tushirish uchun API yo'llari.
 * --------------------------------------------------------------------------
 */

'use strict';

const express = require('express');
const auth = require('../utils/auth');
const { runOne, runAll, listScenarios } = require('../tests/testRunner');

const router = express.Router();

router.get('/list', auth.requireAuth, (req, res) => {
  res.json({ scenarios: listScenarios() });
});

router.post('/run/:id', auth.requireAuth, async (req, res) => {
  const result = await runOne(req.params.id);
  res.json(result);
});

router.post('/run-all', auth.requireAuth, async (req, res) => {
  const result = await runAll();
  res.json(result);
});

module.exports = router;
