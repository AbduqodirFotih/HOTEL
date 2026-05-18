/**
 * testRoutes.js
 * --------------------------------------------------------------------------
 * Test stsenariylarini panel orqali ishga tushirish uchun API yo'llari.
 * Faqat menejer rolida bo'lgan foydalanuvchilarga ruxsat.
 * --------------------------------------------------------------------------
 */

'use strict';

const express = require('express');
const { requireAuth, requirePermission } = require('../utils/auth');
const { runOne, runAll, listScenarios } = require('../tests/testRunner');

const router = express.Router();

router.get('/list', requireAuth, requirePermission('tests.run'), (req, res) => {
  res.json({ scenarios: listScenarios() });
});

router.post('/run/:id', requireAuth, requirePermission('tests.run'), async (req, res) => {
  const result = await runOne(req.params.id);
  res.json(result);
});

router.post('/run-all', requireAuth, requirePermission('tests.run'), async (req, res) => {
  const result = await runAll();
  res.json(result);
});

module.exports = router;
