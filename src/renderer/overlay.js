import { bodyView } from './body.js';
const render = bodyView(document.querySelector('canvas'));
const caption = document.getElementById('caption');
function update(view) {
  render(view.state);document.body.classList.toggle('locating',!!view.locating);
  caption.textContent = view.locating ? '我在这里' : view.state.caption;
  caption.hidden = !view.locating && !view.state.showCaption;
}
window.flypet.subscribe(update);
update((await window.flypet.bootstrap()).view);
