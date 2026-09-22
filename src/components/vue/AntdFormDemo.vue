<template>
  <Space direction="vertical" style="width: 320px">
    <Input
      v-model:value="name"
      placeholder="输入你的名字"
      allow-clear
    />
    <Button type="primary" :disabled="!name" @click="submit">提交</Button>
    <Modal
      v-model:open="resultVisible"
      title="提交结果"
      :footer="null"
    >
      <p>你好,{{ submittedName }}!</p>
      <p>表单已通过 antd Vue 组件提交。</p>
    </Modal>
  </Space>
</template>

<script setup>
import { ref } from 'vue';
import { Button, Input, Modal, Space } from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';

const name = ref('');
const submittedName = ref('');
const resultVisible = ref(false);

const submit = () => {
  submittedName.value = name.value;
  resultVisible.value = true;
  name.value = '';
};
</script>
