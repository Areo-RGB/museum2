import { $ } from './dom.js';
import { floorName } from '../world/lobby.js';

/** DOM directory; selecting a period never fetches its media eagerly. */
export class FloorPanel {
  constructor(floors, { onSelect, onClose }) {
    this.el = $('floorPanel');
    this.list = $('floorList');
    this.buttons = floors.map((floor, index) => {
      const button = document.createElement('button');
      button.className = 'floor-choice';
      const number = document.createElement('span');
      number.className = 'floor-number';
      number.textContent = floorName(index, floors);
      const description = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = floor.label;
      const meta = document.createElement('small');
      meta.textContent = `${floor.range} · ${floor.count} works`;
      description.append(title, meta);
      button.append(number, description);
      button.addEventListener('click', () => onSelect(index));
      return button;
    });
    this.list.replaceChildren(...this.buttons);
    $('closeFloors').addEventListener('click', onClose);
  }

  setCurrent(index) {
    this.current = index;
    this.buttons.forEach((button, i) => {
      button.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
  }
  get isOpen() { return this.el.classList.contains('open'); }
  open() {
    this.el.classList.add('open');
    (this.buttons[this.current] ?? $('closeFloors')).focus();
  }
  close() { this.el.classList.remove('open'); }
}
