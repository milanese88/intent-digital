import React, { useState, useEffect } from 'react';
import Home from './pages/Home.jsx';
import About from './pages/About.jsx';
import Services from './pages/Services.jsx';
import Contact from './pages/Contact.jsx';
import News from './pages/News.jsx';

function App() {
  const [currentPage, setCurrentPage] = useState('home');

  const navigateTo = (page, targetId) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (targetId) {
      setTimeout(() => {
        const element = document.getElementById(targetId);
        if (element) {
          const navHeight = 80;
          const elementPosition = element.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({
            top: elementPosition - navHeight,
            behavior: 'smooth'
          });
        }
      }, 150);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  if (currentPage === 'about') {
    return <About navigateTo={navigateTo} />;
  }

  if (currentPage === 'services') {
    return <Services navigateTo={navigateTo} />;
  }

  if (currentPage === 'contact') {
    return <Contact navigateTo={navigateTo} />;
  }

  if (currentPage === 'news') {
    return <News navigateTo={navigateTo} />;
  }

  return <Home navigateTo={navigateTo} />;
}

export default App;
