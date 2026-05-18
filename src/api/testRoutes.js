/**
 * testRoutes.js
 * --------------------------------------------------------------------------
 * Test stsenariylarini panel orqali ishga tushirish — faqat menejer.
 * Tozalovchi yoki texnik xodim testlarni ishga tushira olmaydi.
 * --------------------------------------------------------------------------
 */

'use strict';

const express = require('express');
const auth = require('../utils/auth');
const { runOne, runAll, listScenarios } = require('../tests/testRunner');

const router = express.Router();

router.get('/list', auth.requireAuth, auth.requirePermission('canRunTests'), (req, res) => {
  res.json({ scenarios: listScenarios() });
});

router.post('/run/:id', auth.requireAuth, auth.requirePermission('canRunTests'), async (req, res) => {
  const result = await runOne(req.params.id);
  res.json(result);
});

router.post('/run-all', auth.requireAuth, auth.requirePermission('canRunTests'), async (req, res) => {
  const result = await runAll();
  res.json(result);
});

module.exports = router;
