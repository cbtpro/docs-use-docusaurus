<template>
  <Space>
    <Button type="primary" @click="open">打开 Modal</Button>
    <Modal
      v-model:open="visible"
      title="操作确认"
      ok-text="确认"
      cancel-text="取消"
      @ok="handleOk"
      @cancel="handleCancel"
    >
      <p>这是一个在 Vue 组件里渲染的 antd Modal。</p>
      <p>当前时间:{{ time }}</p>
    </Modal>
  </Space>
</template>

<script setup>
import { ref } from 'vue';
import { Button, Modal, Space } from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';

const visible = ref(false);
const time = ref('');

const open = () => {
  time.value = new Date().toLocaleString('zh-CN');
  visible.value = true;
};

const handleOk = () => {
  visible.value = false;
};

const handleCancel = () => {
  visible.value = false;
};
</script>
