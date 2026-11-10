import React from 'react';
import StudioJournal from './StudioJournal.jsx';

export default function Overview({ setActiveTab, navigateTo }) {
  return <StudioJournal setActiveTab={setActiveTab} navigateTo={navigateTo} />;
}

