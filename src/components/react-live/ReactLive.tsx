import React from 'react';
import { LiveProvider, LiveEditor, LiveError, LivePreview } from 'react-live';

export default function ReactLive() {
  return (
    <LiveProvider code={`const a: number = 1; a + 1`} language="ts" noInline={true} typescript>
      <LiveEditor />
      <LiveError />
      <LivePreview />
    </LiveProvider>
  );
}