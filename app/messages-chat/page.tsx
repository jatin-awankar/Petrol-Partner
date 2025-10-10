// app/messages-chat/page.tsx
'use client';
import React, { useState } from 'react';
import MessagesShell from '@/components/messages/MessagesShell';
import SafetyReminder from '@/components/messages/SafetyReminder';

const MessagesPage: React.FC = () => {
  const [showSafetyReminder, setShowSafetyReminder] = useState(true);

  return (
    <div className="max-w-7xl mx-auto w-full">
      {showSafetyReminder && (
        <SafetyReminder onDismiss={() => setShowSafetyReminder(false)} />
      )}

      <MessagesShell />
    </div>
  );
};

export default MessagesPage;
