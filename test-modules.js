#!/usr/bin/env node

/**
 * 模块API测试脚本
 * 测试供应商、公司文件、后勤管理、智能驾驶舱等新增模块的API是否正常
 */

const BASE_URL = 'http://localhost:8080/api';

async function testAPI(name, path) {
  try {
    const response = await fetch(`${BASE_URL}${path}`);
    const data = await response.json();

    if (data.success) {
      console.log(`✅ ${name}: 成功 (${Array.isArray(data.data) ? data.data.length + '条记录' : 'OK'})`);
      return true;
    } else {
      console.log(`❌ ${name}: 失败 - ${data.message || '未知错误'}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${name}: 请求失败 - ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('\n===== 开始测试新增模块 API =====\n');

  const tests = [
    // 供应商管理
    { name: '供应商列表', path: '/suppliers' },

    // 公司文件
    { name: '公司文件列表', path: '/documents' },

    // 后勤管理
    { name: '后勤工单列表', path: '/logistics/items' },
    { name: '车辆管理列表', path: '/logistics/vehicles' },

    // 智能驾驶舱
    { name: '智能驾驶舱数据', path: '/cockpit' },

    // 工作台（包含badge数字）
    { name: '工作台数据', path: '/dashboard' },
  ];

  let passed = 0;
  let total = tests.length;

  for (const test of tests) {
    const result = await testAPI(test.name, test.path);
    if (result) passed++;
  }

  console.log(`\n===== 测试完成: ${passed}/${total} 通过 =====\n`);

  if (passed < total) {
    process.exit(1);
  }
}

runTests();