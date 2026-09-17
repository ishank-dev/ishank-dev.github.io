export function filterProjects(projects, category) {
  const selected = category.trim().toLowerCase();
  return projects.filter(project => selected === 'all' || project.category === selected);
}

export function contactDraft({ name, email, subject, message }) {
  const title = subject.trim() || `Portfolio enquiry from ${name.trim()}`;
  const body = `From: ${name.trim()}\nEmail: ${email.trim()}\n\n${message.trim()}`;
  return `mailto:ishankdev@gmail.com?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
