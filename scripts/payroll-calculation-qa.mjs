import assert from 'node:assert/strict';
import { canTransitionPayroll, calculatePayrollAmount, countInclusiveDays, isValidIsoDate, proratedMonthlyPayrollAmount } from '../payroll.js';

assert.equal(isValidIsoDate('2024-02-29'), true);
assert.equal(isValidIsoDate('2025-02-29'), false);
assert.equal(countInclusiveDays('2024-02-01', '2024-02-29'), 29);
assert.equal(proratedMonthlyPayrollAmount(29000, '2024-02-01', '2024-02-29'), 29000);
assert.equal(proratedMonthlyPayrollAmount(31000, '2025-02-01', '2025-02-28'), 31000);
assert.equal(proratedMonthlyPayrollAmount(31000, '2025-02-15', '2025-03-15'), 30500);
assert.equal(calculatePayrollAmount({ ruleType: 'hourly', rate: 450, hours: 13.5 }), 6075);
assert.equal(calculatePayrollAmount({ ruleType: 'per_shift', rate: 1200, shifts: 3 }), 3600);
assert.equal(calculatePayrollAmount({ ruleType: 'percent_revenue', rate: 5, revenue: 300000 }), 15000);
assert.equal(calculatePayrollAmount({ ruleType: 'monthly', rate: 31000, periodFrom: '2025-02-01', periodTo: '2025-02-28' }), 31000);
assert.equal(calculatePayrollAmount({ ruleType: 'unknown', rate: 1 }), null);
assert.equal(calculatePayrollAmount({ ruleType: 'hourly', rate: -1, hours: 1 }), null);

assert.equal(canTransitionPayroll('draft', 'approve'), true);
assert.equal(canTransitionPayroll('approved', 'pay'), true);
assert.equal(canTransitionPayroll('draft', 'cancel'), true);
assert.equal(canTransitionPayroll('approved', 'cancel'), true);
assert.equal(canTransitionPayroll('paid', 'cancel'), false);
assert.equal(canTransitionPayroll('cancelled', 'pay'), false);
assert.equal(canTransitionPayroll('paid', 'pay'), false);

console.log('PAYROLL CALCULATION QA: PASS (date validation, monthly proration, rule calculations, lifecycle transitions)');
