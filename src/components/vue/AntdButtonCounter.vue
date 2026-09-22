<template>
  <Space direction="vertical">
    <Button type="primary" @click="onClick">点击我</Button>
    <Alert
      v-if="count > 0"
      :message="`你已经点击了 ${count} 次`"
      type="info"
      show-icon
    />
  </Space>
</template>

<script setup>
import { ref } from 'vue';
import { Button, Space, Alert } from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';

const count = ref(0);
const onClick = () => {
  count.value += 1;
};
</script>
