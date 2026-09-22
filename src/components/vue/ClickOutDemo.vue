<template>
  <Space direction="vertical">
    <div style="position: relative; display: inline-block">
      <Button type="primary" @click="toggle">打开菜单</Button>
      <div
        v-if="visible"
        v-click-out="handleClickOut"
        style="position: absolute; top: 40px; left: 0; background: #fff; border: 1px solid #d9d9d9; border-radius: 6px; box-shadow: 0 6px 16px rgba(0,0,0,0.08); padding: 4px 0; min-width: 160px; z-index: 10"
      >
        <div
          v-for="item in items"
          :key="item"
          class="menu-item"
          @click="select(item)"
        >
          {{ item }}
        </div>
      </div>
    </div>
    <Alert
      v-if="selected"
      :message="`已选择:${selected}`"
      type="success"
      show-icon
    />
  </Space>
</template>

<script setup>
import { ref } from 'vue';
import { Button, Space, Alert } from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';

// 自定义指令 v-click-out
// 在 <script setup> 里以 v 开头的驼峰命名变量会被识别为自定义指令
const vClickOut = {
  beforeMount(el, binding) {
    console.log('[v-click-out] beforeMount,绑定值:', binding.value);
    el._clickOutHandler = (e) => {
      // 点击目标不在 el 内部,触发回调
      if (el !== e.target && !el.contains(e.target)) {
        console.log('[v-click-out] 检测到外部点击,触发回调', e.target);
        binding.value(e);
      }
    };
    // 延迟一帧挂监听,避免打开按钮的 click 事件冒泡到 document 立即触发关闭
    setTimeout(() => {
      console.log('[v-click-out] 挂监听 document click');
      document.addEventListener('click', el._clickOutHandler);
    });
  },
  unmounted(el) {
    console.log('[v-click-out] unmounted,移除监听');
    if (el._clickOutHandler) {
      document.removeEventListener('click', el._clickOutHandler);
    }
  },
};

const visible = ref(false);
const items = ['编辑', '删除', '复制', '导出'];
const selected = ref('');

const toggle = () => {
  visible.value = !visible.value;
};

const handleClickOut = () => {
  visible.value = false;
};

const select = (item) => {
  selected.value = item;
  visible.value = false;
};
</script>

<style scoped>
.menu-item {
  padding: 6px 16px;
  cursor: pointer;
}
.menu-item:hover {
  background: #f5f5f5;
}
</style>
