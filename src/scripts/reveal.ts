// Entrances: each [data-rise] element rises once, when it first enters the view.
// Without script, or before this runs, the CSS leaves everything visible.
const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  },
  { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
);
document.querySelectorAll('[data-rise]').forEach((el) => io.observe(el));
