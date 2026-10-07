import { $ } from './dom.js';

/** Welcome / pause screen. */
export class Overlay {
  constructor({ onEnter, onTour }) {
    this.el = $('overlay');
    this.enter = $('enter');
    this.count = $('collectionCount');
    this.enter.addEventListener('click', onEnter);
    $('startTour').addEventListener('click', onTour);
  }

  setCollectionSize(n) {
    this.count.textContent = n ? `${n} works in the collection` : 'Collection offline — showing placeholders';
  }

  showWelcome() { this.show('Enter the gallery'); }
  showPaused() { this.show('Continue'); }

  show(label) {
    this.enter.textContent = label;
    this.el.classList.remove('hidden');
  }

  hide() { this.el.classList.add('hidden'); }
  get visible() { return !this.el.classList.contains('hidden'); }
}
