<template>
  <div class="collab">
    <div class="page-header">
      <h2>协同办公</h2>
      <p>待办清单 · 日程安排 · 任务分派 · 会议室预订（自动冲突检测） · 会议纪要 · 委托代办 · 补卡/加班申请</p>
    </div>

    <!-- KPI -->
    <div class="kpi-grid" v-if="stats">
      <div class="kpi-card" v-for="k in kpis" :key="k.title">
        <div class="kpi-icon" :style="{ background: k.color + '20' }">
          <el-icon :size="18" :color="k.color"><component :is="k.icon" /></el-icon>
        </div>
        <div>
          <div class="kpi-title">{{ k.title }}</div>
          <div class="kpi-value">{{ k.value }}</div>
          <div class="kpi-sub">{{ k.sub }}</div>
        </div>
      </div>
    </div>

    <el-tabs v-model="tab" @tab-change="onTabChange">
      <!-- 待办 -->
      <el-tab-pane label="我的待办" name="todo">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-radio-group v-model="todoFilter" size="small" @change="loadTodos">
              <el-radio-button label="undone">未完成</el-radio-button>
              <el-radio-button label="done">已完成</el-radio-button>
              <el-radio-button label="all">全部</el-radio-button>
            </el-radio-group>
          </div>
          <el-button type="primary" size="small" @click="openTodo()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增待办
          </el-button>
        </div>
        <el-table :data="todoRows" stripe size="small" v-loading="loading">
          <el-table-column label="完成" width="70">
            <template #default="{ row }">
              <el-checkbox :model-value="!!row.done" @change="(v) => toggleTodo(row, v)" />
            </template>
          </el-table-column>
          <el-table-column prop="content" label="待办内容" min-width="240" show-overflow-tooltip />
          <el-table-column label="优先级" width="90">
            <template #default="{ row }">
              <el-tag :type="priorityType(row.priority)" size="small">{{ row.priority }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="截止日" width="120">
            <template #default="{ row }">
              <span :class="{ 'text-danger': isOverdue(row) }">{{ row.due_date || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.done ? 'success' : 'info'" size="small">{{ row.done ? '已完成' : '未完成' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="完成时间" width="150">
            <template #default="{ row }">{{ row.finished_at ? row.finished_at.slice(0, 16) : '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openTodo(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="delTodo(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无待办，点击右上角「新增待办」添加</span></template>
        </el-table>
      </el-tab-pane>

      <!-- 日程 -->
      <el-tab-pane label="我的日程" name="sched">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-date-picker v-model="schedDate" type="date" value-format="YYYY-MM-DD" placeholder="按日期筛选" style="width:160px" clearable @change="loadSchedules" />
            <el-select v-model="schedType" placeholder="全部类型" style="width:120px" clearable @change="loadSchedules">
              <el-option v-for="t in meta.sched_types" :key="t" :label="t" :value="t" />
            </el-select>
          </div>
          <div>
            <el-button size="small" @click="loadRemind">
              <el-icon style="margin-right:4px"><Bell /></el-icon>检查提醒
            </el-button>
            <el-button type="primary" size="small" @click="openSched()">
              <el-icon style="margin-right:4px"><Plus /></el-icon>新建日程
            </el-button>
          </div>
        </div>
        <el-table :data="schedRows" stripe size="small" v-loading="loading">
          <el-table-column prop="sched_date" label="日期" width="110" />
          <el-table-column label="时间" width="110">
            <template #default="{ row }">{{ row.start_time ? row.start_time + '-' + row.end_time : '全天' }}</template>
          </el-table-column>
          <el-table-column prop="title" label="日程标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="type" label="类型" width="90" />
          <el-table-column prop="location" label="地点" width="140" show-overflow-tooltip />
          <el-table-column prop="attendees" label="参与人" width="150" show-overflow-tooltip />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === '已完成' ? 'success' : row.status === '已取消' ? 'danger' : 'info'" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="190" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="finishSched(row)" :disabled="row.status === '已完成'">完成</el-button>
              <el-button size="small" @click="openSched(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="delSched(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无日程</span></template>
        </el-table>
      </el-tab-pane>

      <!-- 任务 -->
      <el-tab-pane label="任务" name="task">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="taskStatus" placeholder="全部状态" style="width:120px" clearable @change="loadTasks">
              <el-option v-for="s in meta.task_status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="taskKw" placeholder="搜索任务号/标题" style="width:200px" clearable @change="loadTasks" />
          </div>
          <el-button type="primary" size="small" @click="openTask()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>指派任务
          </el-button>
        </div>
        <el-table :data="taskRows" stripe size="small" v-loading="loading">
          <el-table-column prop="task_no" label="任务号" width="140" />
          <el-table-column prop="title" label="任务标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="assignee_name" label="执行人" width="100" />
          <el-table-column prop="assigner_name" label="指派人" width="100" />
          <el-table-column label="优先级" width="90">
            <template #default="{ row }">
              <el-tag :type="priorityType(row.priority)" size="small">{{ row.priority }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="进度" width="160">
            <template #default="{ row }"><el-progress :percentage="row.progress || 0" :stroke-width="12" /></template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="taskStatusType(row.status)" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="截止" width="110">
            <template #default="{ row }">{{ row.due_date || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openProgress(row)">更新进度</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无任务</span></template>
        </el-table>
      </el-tab-pane>

      <!-- 会议室 -->
      <el-tab-pane label="会议室预订" name="room">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="roomId" placeholder="全部会议室" style="width:170px" clearable @change="loadResv">
              <el-option v-for="r in meta.rooms" :key="r.id" :label="r.name" :value="r.id" />
            </el-select>
            <el-date-picker v-model="resvDate" type="date" value-format="YYYY-MM-DD" placeholder="预订日期" style="width:160px" clearable @change="loadResv" />
          </div>
          <div>
            <el-button size="small" type="primary" plain @click="openRoom()">
              <el-icon style="margin-right:4px"><OfficeBuilding /></el-icon>登记会议室
            </el-button>
            <el-button type="primary" size="small" @click="openResv()">
              <el-icon style="margin-right:4px"><Plus /></el-icon>预订会议
            </el-button>
          </div>
        </div>
        <el-table :data="resvRows" stripe size="small" v-loading="loading">
          <el-table-column label="会议室" width="150">
            <template #default="{ row }">{{ row.room_name || ('#' + row.room_id) }}</template>
          </el-table-column>
          <el-table-column prop="subject" label="会议主题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="reserve_date" label="日期" width="110" />
          <el-table-column label="时段" width="120">
            <template #default="{ row }">{{ row.start_time }}-{{ row.end_time }}</template>
          </el-table-column>
          <el-table-column prop="organizer_name" label="预订人" width="100" />
          <el-table-column prop="attendees" label="参会人" min-width="160" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === '已预约' ? 'primary' : row.status === '已取消' ? 'danger' : 'info'" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="danger" :disabled="row.status !== '已预约'" @click="cancelResv(row)">取消</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无预订记录</span></template>
        </el-table>
      </el-tab-pane>

      <!-- 会议纪要 -->
      <el-tab-pane label="会议纪要" name="note">
        <div class="tab-toolbar">
          <span class="muted">纪要中的「决议」会逐条自动生成闭环任务（指派给组织者，优先级高）</span>
          <el-button type="primary" size="small" @click="openNote()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>录入纪要
          </el-button>
        </div>
        <el-table :data="noteRows" stripe size="small" v-loading="loading">
          <el-table-column prop="subject" label="会议主题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="meeting_date" label="会议日期" width="110" />
          <el-table-column prop="organizer_name" label="组织者" width="100" />
          <el-table-column prop="attendees" label="参会人" width="160" show-overflow-tooltip />
          <el-table-column prop="content" label="纪要内容" min-width="200" show-overflow-tooltip />
          <el-table-column label="决议" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-for="(d, i) in decisionList(row.decisions)" :key="i" class="decision-line">{{ i + 1 }}. {{ d }}</span>
              <span v-if="!row.decisions" class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="150">
            <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <template #empty><span class="muted">暂无会议纪要</span></template>
        </el-table>
      </el-tab-pane>

      <!-- 委托 -->
      <el-tab-pane label="委托代办" name="deleg">
        <div class="tab-toolbar">
          <span class="muted">生效期内受托人可代办委托人的审批事项；到期后自动失效展示</span>
          <el-button type="primary" size="small" @click="openDeleg()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新建委托
          </el-button>
        </div>
        <el-table :data="delegRows" stripe size="small" v-loading="loading">
          <el-table-column prop="from_emp_name" label="委托人" width="110" />
          <el-table-column prop="to_emp_name" label="受托人" width="110" />
          <el-table-column label="有效期" width="200">
            <template #default="{ row }">{{ row.start_date }} ~ {{ row.end_date }}</template>
          </el-table-column>
          <el-table-column prop="scope" label="委托范围" width="110" />
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="row.status === '生效' ? (row.expired ? 'warning' : 'success') : 'info'" size="small">
                {{ row.status === '生效' ? (row.expired ? '已过期' : '生效中') : '已停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button size="small" :disabled="row.status !== '生效'" @click="stopDeleg(row)">停用</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无委托记录</span></template>
        </el-table>
      </el-tab-pane>

      <!-- 补卡 -->
      <el-tab-pane label="补卡申请" name="cardfix">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;">
            <el-select v-model="fixStatus" placeholder="全部状态" style="width:130px" clearable @change="loadCardfix">
              <el-option v-for="s in meta.req_status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-checkbox v-model="fixAll" @change="loadCardfix">查看全部（管理层）</el-checkbox>
          </div>
          <el-button type="primary" size="small" @click="openFix()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>补卡申请
          </el-button>
        </div>
        <el-table :data="fixRows" stripe size="small" v-loading="loading">
          <el-table-column prop="cf_no" label="单号" width="150" />
          <el-table-column prop="emp_name" label="申请人" width="100" />
          <el-table-column prop="dept_name" label="部门" width="130" />
          <el-table-column prop="work_date" label="补卡日期" width="110" />
          <el-table-column prop="fix_type" label="类型" width="100" />
          <el-table-column prop="expect_time" label="应打卡时间" width="120" />
          <el-table-column prop="reason" label="事由" min-width="200" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="reqType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="success" :disabled="row.status !== '待审批'" @click="reviewFix(row, '已通过')">通过</el-button>
              <el-button size="small" type="danger" :disabled="row.status !== '待审批'" @click="reviewFix(row, '驳回')">驳回</el-button>
              <el-button size="small" :disabled="row.status !== '待审批'" @click="reviewFix(row, '已撤销')">撤销</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无补卡申请</span></template>
        </el-table>
      </el-tab-pane>

      <!-- 加班 -->
      <el-tab-pane label="加班申请" name="ot">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;">
            <el-select v-model="otStatus" placeholder="全部状态" style="width:130px" clearable @change="loadOvertime">
              <el-option v-for="s in meta.req_status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-checkbox v-model="otAll" @change="loadOvertime">查看全部（管理层）</el-checkbox>
          </div>
          <el-button type="primary" size="small" @click="openOt()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>加班申请
          </el-button>
        </div>
        <el-table :data="otRows" stripe size="small" v-loading="loading">
          <el-table-column prop="ot_no" label="单号" width="150" />
          <el-table-column prop="emp_name" label="申请人" width="100" />
          <el-table-column prop="dept_name" label="部门" width="130" />
          <el-table-column prop="ot_date" label="加班日期" width="110" />
          <el-table-column label="时长" width="80">
            <template #default="{ row }">{{ row.hours }}h</template>
          </el-table-column>
          <el-table-column prop="ot_type" label="类型" width="110" />
          <el-table-column prop="comp_type" label="补偿方式" width="100" />
          <el-table-column prop="reason" label="事由" min-width="200" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="reqType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="success" :disabled="row.status !== '待审批'" @click="reviewOt(row, '已通过')">通过</el-button>
              <el-button size="small" type="danger" :disabled="row.status !== '待审批'" @click="reviewOt(row, '驳回')">驳回</el-button>
              <el-button size="small" :disabled="row.status !== '待审批'" @click="reviewOt(row, '已撤销')">撤销</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无加班申请</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 待办弹窗 -->
    <el-dialog v-model="todoDlg.visible" :title="todoDlg.id ? '编辑待办' : '新增待办'" width="460px">
      <el-form label-width="80px" size="small">
        <el-form-item label="内容" required>
          <el-input v-model="todoDlg.form.content" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="待办事项（≤200字）" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="todoDlg.form.priority">
            <el-radio-button v-for="p in meta.todo_priorities" :key="p" :label="p">{{ p }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="截止日">
          <el-date-picker v-model="todoDlg.form.due_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="todoDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="todoDlg.saving" @click="submitTodo">提交</el-button>
      </template>
    </el-dialog>

    <!-- 日程弹窗 -->
    <el-dialog v-model="schedDlg.visible" :title="schedDlg.id ? '编辑日程' : '新建日程'" width="480px">
      <el-form label-width="80px" size="small">
        <el-form-item label="标题" required><el-input v-model="schedDlg.form.title" placeholder="日程标题" /></el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker v-model="schedDlg.form.sched_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="时间段">
          <el-time-picker v-model="schedDlg.timeRange" is-range range-separator="至" format="HH:mm" value-format="HH:mm" style="width:100%" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="schedDlg.form.type" style="width:100%">
            <el-option v-for="t in meta.sched_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="地点"><el-input v-model="schedDlg.form.location" placeholder="会议地点/客户现场" /></el-form-item>
        <el-form-item label="参与人"><el-input v-model="schedDlg.form.attendees" placeholder="逗号分隔，共享给这些人" /></el-form-item>
        <el-form-item label="提醒(分)"><el-input-number v-model="schedDlg.form.remind" :min="0" :max="1440" :step="5" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="schedDlg.form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="schedDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="schedDlg.saving" @click="submitSched">提交</el-button>
      </template>
    </el-dialog>

    <!-- 任务弹窗 -->
    <el-dialog v-model="taskDlg.visible" title="指派任务" width="500px">
      <el-form label-width="90px" size="small">
        <el-form-item label="任务标题" required><el-input v-model="taskDlg.form.title" /></el-form-item>
        <el-form-item label="执行人" required>
          <el-select v-model="taskDlg.form.assignee_id" filterable style="width:100%" placeholder="选择在职员工">
            <el-option v-for="e in meta.employees" :key="e.id" :label="e.name + '（' + (e.emp_no || e.id) + '）'" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="taskDlg.form.priority" style="width:100%">
            <el-option v-for="p in meta.priorities" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="截止日">
          <el-date-picker v-model="taskDlg.form.due_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="taskDlg.form.descr" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="taskDlg.saving" @click="submitTask">提交</el-button>
      </template>
    </el-dialog>

    <!-- 进度弹窗 -->
    <el-dialog v-model="progDlg.visible" :title="'更新进度 · ' + progDlg.title" width="400px">
      <el-form label-width="80px" size="small">
        <el-form-item label="进度"><el-slider v-model="progDlg.progress" :step="5" show-input /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="progDlg.status" style="width:100%">
            <el-option v-for="s in meta.task_status" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="progDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="progDlg.saving" @click="submitProgress">提交</el-button>
      </template>
    </el-dialog>

    <!-- 会议室弹窗 -->
    <el-dialog v-model="roomDlg.visible" title="登记会议室" width="420px">
      <el-form label-width="90px" size="small">
        <el-form-item label="名称" required><el-input v-model="roomDlg.form.name" placeholder="如：三楼第一会议室" /></el-form-item>
        <el-form-item label="容纳人数"><el-input-number v-model="roomDlg.form.capacity" :min="1" :max="500" /></el-form-item>
        <el-form-item label="位置"><el-input v-model="roomDlg.form.location" /></el-form-item>
        <el-form-item label="设备"><el-input v-model="roomDlg.form.equipment" placeholder="投影/视频会议/白板" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="roomDlg.form.status" style="width:100%">
            <el-option v-for="s in meta.room_status" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roomDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="roomDlg.saving" @click="submitRoom">提交</el-button>
      </template>
    </el-dialog>

    <!-- 预订弹窗 -->
    <el-dialog v-model="resvDlg.visible" title="预订会议室" width="480px">
      <el-form label-width="90px" size="small">
        <el-form-item label="会议室" required>
          <el-select v-model="resvDlg.form.room_id" style="width:100%" placeholder="仅显示可用会议室">
            <el-option v-for="r in meta.rooms" :key="r.id" :label="r.name + '（' + r.capacity + '人）'" :value="r.id" :disabled="r.status !== '可用'" />
          </el-select>
        </el-form-item>
        <el-form-item label="主题" required><el-input v-model="resvDlg.form.subject" /></el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker v-model="resvDlg.form.reserve_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="时间段" required>
          <el-time-picker v-model="resvDlg.timeRange" is-range range-separator="至" format="HH:mm" value-format="HH:mm" style="width:100%" />
        </el-form-item>
        <el-form-item label="参会人"><el-input v-model="resvDlg.form.attendees" placeholder="逗号分隔" /></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" show-icon title="同一会议室在重叠时段不可重复预订，提交时自动检测冲突" style="margin-bottom:8px;" />
      <template #footer>
        <el-button @click="resvDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="resvDlg.saving" @click="submitResv">提交</el-button>
      </template>
    </el-dialog>

    <!-- 纪要弹窗 -->
    <el-dialog v-model="noteDlg.visible" title="录入会议纪要" width="600px">
      <el-form label-width="90px" size="small">
        <el-form-item label="关联预订">
          <el-select v-model="noteDlg.form.reservation_id" clearable filterable style="width:100%" placeholder="可选，关联会议室预订">
            <el-option v-for="v in resvRows" :key="v.id" :label="(v.room_name || v.subject) + ' ' + v.reserve_date" :value="v.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="会议主题" required><el-input v-model="noteDlg.form.subject" /></el-form-item>
        <el-form-item label="会议日期">
          <el-date-picker v-model="noteDlg.form.meeting_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="参会人"><el-input v-model="noteDlg.form.attendees" placeholder="逗号分隔" /></el-form-item>
        <el-form-item label="纪要内容"><el-input v-model="noteDlg.form.content" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="决议">
          <el-input v-model="noteDlg.form.decisions" type="textarea" :rows="3" placeholder="每行一条决议，>3 字的行会自动生成闭环任务" />
        </el-form-item>
        <el-form-item label="任务截止">
          <el-date-picker v-model="noteDlg.form.due_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="noteDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="noteDlg.saving" @click="submitNote">提交</el-button>
      </template>
    </el-dialog>

    <!-- 委托弹窗 -->
    <el-dialog v-model="delegDlg.visible" title="新建委托" width="440px">
      <el-form label-width="90px" size="small">
        <el-form-item label="受托人" required>
          <el-select v-model="delegDlg.form.to_emp_id" filterable style="width:100%">
            <el-option v-for="e in meta.employees" :key="e.id" :label="e.name + '（' + (e.emp_no || e.id) + '）'" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="有效期" required>
          <el-date-picker v-model="delegDlg.dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" style="width:100%" />
        </el-form-item>
        <el-form-item label="委托范围">
          <el-select v-model="delegDlg.form.scope" style="width:100%">
            <el-option v-for="s in meta.deleg_scopes" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="delegDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="delegDlg.saving" @click="submitDeleg">提交</el-button>
      </template>
    </el-dialog>

    <!-- 补卡弹窗 -->
    <el-dialog v-model="fixDlg.visible" title="补卡申请" width="460px">
      <el-form label-width="100px" size="small">
        <el-form-item label="补卡日期" required>
          <el-date-picker v-model="fixDlg.form.work_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="补卡类型">
          <el-select v-model="fixDlg.form.fix_type" style="width:100%">
            <el-option v-for="t in meta.fix_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="应打卡时间"><el-input v-model="fixDlg.form.expect_time" placeholder="如 09:00" /></el-form-item>
        <el-form-item label="事由" required><el-input v-model="fixDlg.form.reason" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fixDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="fixDlg.saving" @click="submitFix">提交</el-button>
      </template>
    </el-dialog>

    <!-- 加班弹窗 -->
    <el-dialog v-model="otDlg.visible" title="加班申请" width="480px">
      <el-form label-width="100px" size="small">
        <el-form-item label="加班日期" required>
          <el-date-picker v-model="otDlg.form.ot_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="时长(小时)" required>
          <el-input-number v-model="otDlg.form.hours" :min="0.5" :max="24" :step="0.5" :precision="1" />
        </el-form-item>
        <el-form-item label="加班类型">
          <el-select v-model="otDlg.form.ot_type" style="width:100%">
            <el-option v-for="t in meta.ot_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="补偿方式">
          <el-select v-model="otDlg.form.comp_type" style="width:100%">
            <el-option v-for="t in meta.comp_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="事由" required><el-input v-model="otDlg.form.reason" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="otDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="otDlg.saving" @click="submitOt">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Calendar, List, CircleCheck, Clock, Plus, OfficeBuilding, Bell, Van, Refresh, EditPen,
} from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('todo');
const loading = ref(false);
const stats = ref(null);
const meta = reactive({
  rooms: [], employees: [], sched_types: [], sched_status: [], priorities: [], todo_priorities: [],
  task_status: [], room_status: [], resv_status: [], deleg_scopes: [], fix_types: [], ot_types: [],
  comp_types: [], req_status: [],
});

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '未完成待办', value: s.todo_undone, sub: `今日到期 ${s.todo_today} 条`, icon: List, color: '#2563eb' },
    { title: '今日日程', value: s.sched_today, sub: '不含已取消', icon: Calendar, color: '#f59e0b' },
    { title: '进行中任务', value: s.task_running, sub: `已逾期 ${s.task_overdue} 个`, icon: Refresh, color: '#8b5cf6' },
    { title: '今日会议', value: s.resv_today, sub: `可用会议室 ${s.room_available}/${s.room_total}`, icon: OfficeBuilding, color: '#10b981' },
    { title: '待审批申请', value: (s.pending_cardfix || 0) + (s.pending_overtime || 0), sub: `补卡 ${s.pending_cardfix} · 加班 ${s.pending_overtime}`, icon: Clock, color: '#ef4444' },
  ];
});

function priorityType(p) { return p === '高' ? 'danger' : p === '中' ? 'warning' : 'info'; }
function taskStatusType(s) { return s === '已完成' ? 'success' : s === '已逾期' ? 'danger' : s === '进行中' ? 'primary' : 'info'; }
function reqType(s) { return s === '已通过' ? 'success' : s === '驳回' ? 'danger' : s === '已撤销' ? 'info' : 'warning'; }
function decisionList(d) { return String(d || '').split('\n').map((x) => x.trim()).filter(Boolean); }
const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (row) => !row.done && row.due_date && row.due_date < today();

/* ---------------- 数据加载 ---------------- */
const todoRows = ref([]);
const schedRows = ref([]);
const taskRows = ref([]);
const resvRows = ref([]);
const noteRows = ref([]);
const delegRows = ref([]);
const fixRows = ref([]);
const otRows = ref([]);

const todoFilter = ref('undone');
const schedDate = ref('');
const schedType = ref('');
const taskStatus = ref('');
const taskKw = ref('');
const roomId = ref('');
const resvDate = ref('');
const fixStatus = ref('');
const fixAll = ref(false);
const otStatus = ref('');
const otAll = ref(false);

async function loadMeta() {
  const r = await request.get('/collab/options');
  if (r.code === 200) Object.assign(meta, r.data || {});
}
async function loadStats() {
  const r = await request.get('/collab/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadTodos() {
  loading.value = true;
  try {
    const r = await request.get('/collab/todos', { params: { limit: 'all' } });
    let rows = r.code === 200 ? r.data || [] : [];
    if (todoFilter.value === 'undone') rows = rows.filter((x) => !x.done);
    if (todoFilter.value === 'done') rows = rows.filter((x) => x.done);
    todoRows.value = rows;
  } finally { loading.value = false; }
}
async function loadSchedules() {
  loading.value = true;
  try {
    const p = {};
    if (schedDate.value) p.date = schedDate.value;
    const r = await request.get('/collab/schedules', { params: p });
    let rows = r.code === 200 ? r.data || [] : [];
    if (schedType.value) rows = rows.filter((x) => x.type === schedType.value);
    schedRows.value = rows;
  } finally { loading.value = false; }
}
async function loadTasks() {
  loading.value = true;
  try {
    const p = {};
    if (taskStatus.value) p.status = taskStatus.value;
    if (taskKw.value) p.q = taskKw.value;
    const r = await request.get('/collab/tasks', { params: p });
    taskRows.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadResv() {
  loading.value = true;
  try {
    const p = {};
    if (roomId.value) p.room_id = roomId.value;
    if (resvDate.value) p.date = resvDate.value;
    const r = await request.get('/collab/reservations', { params: p });
    resvRows.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadNotes() {
  const r = await request.get('/collab/notes');
  noteRows.value = r.code === 200 ? r.data || [] : [];
}
async function loadDeleg() {
  const r = await request.get('/collab/delegations');
  delegRows.value = r.code === 200 ? r.data || [] : [];
}
async function loadCardfix() {
  const p = {};
  if (fixStatus.value) p.status = fixStatus.value;
  if (fixAll.value) p.all = '1';
  const r = await request.get('/collab/cardfix', { params: p });
  fixRows.value = r.code === 200 ? r.data || [] : [];
}
async function loadOvertime() {
  const p = {};
  if (otStatus.value) p.status = otStatus.value;
  if (otAll.value) p.all = '1';
  const r = await request.get('/collab/overtime', { params: p });
  otRows.value = r.code === 200 ? r.data || [] : [];
}
async function loadRooms() {
  await loadMeta();
}
function onTabChange(name) {
  if (name === 'todo') loadTodos();
  else if (name === 'sched') loadSchedules();
  else if (name === 'task') loadTasks();
  else if (name === 'room') { loadRooms(); loadResv(); }
  else if (name === 'note') { loadNotes(); loadResv(); }
  else if (name === 'deleg') loadDeleg();
  else if (name === 'cardfix') loadCardfix();
  else if (name === 'ot') loadOvertime();
}
onMounted(async () => {
  await loadMeta();
  await loadStats();
  await loadTodos();
  await loadResv();
});

/* ---------------- 待办 ---------------- */
const todoDlg = reactive({ visible: false, saving: false, id: null, form: { content: '', priority: '普通', due_date: '' } });
function openTodo(row) {
  todoDlg.id = row ? row.id : null;
  todoDlg.form = row
    ? { content: row.content, priority: row.priority, due_date: row.due_date || '' }
    : { content: '', priority: '普通', due_date: '' };
  todoDlg.visible = true;
}
async function submitTodo() {
  if (!todoDlg.form.content.trim()) { ElMessage.warning('待办内容必填'); return; }
  todoDlg.saving = true;
  const r = todoDlg.id
    ? await request.put(`/collab/todos/${todoDlg.id}`, todoDlg.form)
    : await request.post('/collab/todos', todoDlg.form);
  todoDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); todoDlg.visible = false; loadTodos(); loadStats(); }
  else ElMessage.error(r.msg || '保存失败');
}
async function toggleTodo(row, v) {
  const r = await request.put(`/collab/todos/${row.id}`, { done: !!v });
  if (r.code === 200) { ElMessage.success(v ? '已完成' : '已重开'); loadTodos(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}
async function delTodo(row) {
  await ElMessageBox.confirm(`确认删除待办「${row.content.slice(0, 20)}」？`, '提示', { type: 'warning' }).catch(() => null);
  const r = await request.delete(`/collab/todos/${row.id}`);
  if (r.code === 200) { ElMessage.success('已删除'); loadTodos(); loadStats(); }
}

/* ---------------- 日程 ---------------- */
const schedDlg = reactive({
  visible: false, saving: false, id: null, timeRange: '',
  form: { title: '', sched_date: today(), start_time: '', end_time: '', type: '个人', location: '', remind: 0, attendees: '', remark: '' },
});
function openSched(row) {
  schedDlg.id = row ? row.id : null;
  schedDlg.timeRange = row && row.start_time && row.end_time ? [row.start_time, row.end_time] : '';
  schedDlg.form = row
    ? { title: row.title, sched_date: row.sched_date, start_time: row.start_time || '', end_time: row.end_time || '', type: row.type, location: row.location || '', remind: row.remind || 0, attendees: row.attendees || '', remark: row.remark || '' }
    : { title: '', sched_date: today(), start_time: '', end_time: '', type: '个人', location: '', remind: 0, attendees: '', remark: '' };
  schedDlg.visible = true;
}
async function submitSched() {
  if (!schedDlg.form.title || !schedDlg.form.sched_date) { ElMessage.warning('标题与日期必填'); return; }
  if (Array.isArray(schedDlg.timeRange) && schedDlg.timeRange.length === 2) {
    schedDlg.form.start_time = schedDlg.timeRange[0];
    schedDlg.form.end_time = schedDlg.timeRange[1];
  } else { schedDlg.form.start_time = ''; schedDlg.form.end_time = ''; }
  schedDlg.saving = true;
  const r = schedDlg.id
    ? await request.put(`/collab/schedules/${schedDlg.id}`, schedDlg.form)
    : await request.post('/collab/schedules', schedDlg.form);
  schedDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); schedDlg.visible = false; loadSchedules(); loadStats(); }
  else ElMessage.error(r.msg || '保存失败');
}
async function finishSched(row) {
  const r = await request.put(`/collab/schedules/${row.id}`, { done: 1, status: '已完成' });
  if (r.code === 200) { ElMessage.success('已标记完成'); loadSchedules(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}
async function delSched(row) {
  await ElMessageBox.confirm(`确认删除日程「${row.title}」？`, '提示', { type: 'warning' }).catch(() => null);
  const r = await request.delete(`/collab/schedules/${row.id}`);
  if (r.code === 200) { ElMessage.success('已删除'); loadSchedules(); loadStats(); }
}
async function loadRemind() {
  const r = await request.post('/collab/schedules/check-reminders');
  if (r.code === 200) {
    const n = (r.data && r.data.notified || []).length;
    ElMessage.success(n ? `已推送 ${n} 条日程提醒到消息中心` : '当前没有需要提醒的日程');
  }
}

/* ---------------- 任务 ---------------- */
const taskDlg = reactive({
  visible: false, saving: false,
  form: { title: '', assignee_id: null, priority: '普通', due_date: '', descr: '', biz_type: '', biz_id: null },
});
function openTask() {
  Object.assign(taskDlg.form, { title: '', assignee_id: null, priority: '普通', due_date: '', descr: '', biz_type: '', biz_id: null });
  taskDlg.visible = true;
}
async function submitTask() {
  if (!taskDlg.form.title || !taskDlg.form.assignee_id) { ElMessage.warning('任务标题与执行人必填'); return; }
  taskDlg.saving = true;
  const r = await request.post('/collab/tasks', taskDlg.form);
  taskDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已指派'); taskDlg.visible = false; loadTasks(); loadStats(); }
  else ElMessage.error(r.msg || '指派失败');
}
const progDlg = reactive({ visible: false, saving: false, id: null, title: '', progress: 0, status: '进行中' });
function openProgress(row) {
  progDlg.id = row.id;
  progDlg.title = row.title;
  progDlg.progress = row.progress || 0;
  progDlg.status = row.status;
  progDlg.visible = true;
}
async function submitProgress() {
  progDlg.saving = true;
  const r = await request.put(`/collab/tasks/${progDlg.id}/progress`, { progress: progDlg.progress, status: progDlg.status });
  progDlg.saving = false;
  if (r.code === 200) { ElMessage.success('进度已更新'); progDlg.visible = false; loadTasks(); loadStats(); }
  else ElMessage.error(r.msg || '更新失败');
}

/* ---------------- 会议室 ---------------- */
const roomDlg = reactive({ visible: false, saving: false, form: { name: '', capacity: 10, location: '', equipment: '', status: '可用' } });
function openRoom() {
  Object.assign(roomDlg.form, { name: '', capacity: 10, location: '', equipment: '', status: '可用' });
  roomDlg.visible = true;
}
async function submitRoom() {
  if (!roomDlg.form.name) { ElMessage.warning('会议室名称必填'); return; }
  roomDlg.saving = true;
  const r = await request.post('/collab/rooms', roomDlg.form);
  roomDlg.saving = false;
  if (r.code === 200) { ElMessage.success('已登记'); roomDlg.visible = false; loadMeta(); loadStats(); }
  else ElMessage.error(r.msg || '登记失败');
}
const resvDlg = reactive({
  visible: false, saving: false, timeRange: '',
  form: { room_id: null, subject: '', reserve_date: today(), start_time: '', end_time: '', attendees: '' },
});
function openResv() {
  resvDlg.timeRange = ['09:00', '10:00'];
  Object.assign(resvDlg.form, { room_id: null, subject: '', reserve_date: today(), start_time: '09:00', end_time: '10:00', attendees: '' });
  resvDlg.visible = true;
}
async function submitResv() {
  if (!resvDlg.form.room_id || !resvDlg.form.subject) { ElMessage.warning('会议室与主题必填'); return; }
  if (Array.isArray(resvDlg.timeRange) && resvDlg.timeRange.length === 2) {
    resvDlg.form.start_time = resvDlg.timeRange[0];
    resvDlg.form.end_time = resvDlg.timeRange[1];
  }
  if (!resvDlg.form.start_time || !resvDlg.form.end_time) { ElMessage.warning('请选择时间段'); return; }
  resvDlg.saving = true;
  const r = await request.post('/collab/reservations', resvDlg.form);
  resvDlg.saving = false;
  if (r.code === 200) { ElMessage.success('预订成功'); resvDlg.visible = false; loadResv(); loadStats(); }
  else ElMessage.error(r.msg || '预订失败');
}
async function cancelResv(row) {
  const r = await request.put(`/collab/reservations/${row.id}/cancel`);
  if (r.code === 200) { ElMessage.success('已取消'); loadResv(); loadStats(); }
  else ElMessage.error(r.msg || '取消失败');
}

/* ---------------- 纪要 ---------------- */
const noteDlg = reactive({
  visible: false, saving: false,
  form: { reservation_id: null, subject: '', meeting_date: today(), attendees: '', content: '', decisions: '', due_date: '' },
});
function openNote() {
  Object.assign(noteDlg.form, { reservation_id: null, subject: '', meeting_date: today(), attendees: '', content: '', decisions: '', due_date: '' });
  noteDlg.visible = true;
}
async function submitNote() {
  if (!noteDlg.form.subject) { ElMessage.warning('会议主题必填'); return; }
  noteDlg.saving = true;
  const r = await request.post('/collab/notes', noteDlg.form);
  noteDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); noteDlg.visible = false; loadNotes(); loadTasks(); loadStats(); }
  else ElMessage.error(r.msg || '保存失败');
}

/* ---------------- 委托 ---------------- */
const delegDlg = reactive({ visible: false, saving: false, dateRange: '', form: { to_emp_id: null, start_date: '', end_date: '', scope: '全部' } });
function openDeleg() {
  delegDlg.dateRange = [today(), today()];
  Object.assign(delegDlg.form, { to_emp_id: null, start_date: today(), end_date: today(), scope: '全部' });
  delegDlg.visible = true;
}
async function submitDeleg() {
  if (!delegDlg.form.to_emp_id) { ElMessage.warning('请选择受托人'); return; }
  if (Array.isArray(delegDlg.dateRange) && delegDlg.dateRange.length === 2) {
    delegDlg.form.start_date = delegDlg.dateRange[0];
    delegDlg.form.end_date = delegDlg.dateRange[1];
  }
  if (!delegDlg.form.start_date || !delegDlg.form.end_date) { ElMessage.warning('请选择有效期'); return; }
  delegDlg.saving = true;
  const r = await request.post('/collab/delegations', delegDlg.form);
  delegDlg.saving = false;
  if (r.code === 200) { ElMessage.success('委托已生效'); delegDlg.visible = false; loadDeleg(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function stopDeleg(row) {
  const r = await request.put(`/collab/delegations/${row.id}`, { status: '已停用' });
  if (r.code === 200) { ElMessage.success('已停用'); loadDeleg(); }
  else ElMessage.error(r.msg || '操作失败');
}

/* ---------------- 补卡 / 加班 ---------------- */
const fixDlg = reactive({ visible: false, saving: false, form: { work_date: today(), fix_type: '上班补卡', expect_time: '09:00', reason: '' } });
function openFix() {
  Object.assign(fixDlg.form, { work_date: today(), fix_type: '上班补卡', expect_time: '09:00', reason: '' });
  fixDlg.visible = true;
}
async function submitFix() {
  if (!fixDlg.form.work_date || !fixDlg.form.reason) { ElMessage.warning('补卡日期与事由必填'); return; }
  fixDlg.saving = true;
  const r = await request.post('/collab/cardfix', fixDlg.form);
  fixDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); fixDlg.visible = false; loadCardfix(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function reviewFix(row, status) {
  const r = await request.put(`/collab/cardfix/${row.id}`, { status });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadCardfix(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}
const otDlg = reactive({ visible: false, saving: false, form: { ot_date: today(), hours: 2, ot_type: '工作日', comp_type: '调休', reason: '' } });
function openOt() {
  Object.assign(otDlg.form, { ot_date: today(), hours: 2, ot_type: '工作日', comp_type: '调休', reason: '' });
  otDlg.visible = true;
}
async function submitOt() {
  if (!otDlg.form.ot_date || !otDlg.form.reason) { ElMessage.warning('加班日期与事由必填'); return; }
  otDlg.saving = true;
  const r = await request.post('/collab/overtime', otDlg.form);
  otDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); otDlg.visible = false; loadOvertime(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function reviewOt(row, status) {
  const r = await request.put(`/collab/overtime/${row.id}`, { status });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadOvertime(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}
</script>

<style scoped>
.collab { padding: 20px; }
.muted { color: #909399; }
.text-danger { color: #f56c6c; }
.page-header { margin-bottom: 18px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header p { margin: 0; color: #909399; font-size: 13px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.decision-line { display: block; line-height: 1.6; }
.el-form-item { margin-bottom: 12px; }
</style>
