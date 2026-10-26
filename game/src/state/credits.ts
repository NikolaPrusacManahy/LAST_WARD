// Update 0.8 — everything in the game made by someone else, shown on the Credits screen (main menu).
// CC BY 4.0 needs the title, the author, the licence and a link to the source: keep all four here.
// Pure data (tested: every prop model has a credit).
import type { PropKind } from '../world/props';

export interface Credit {
  id: string;
  /** What it is in the game. */
  what: string;
  title: string;
  author: string;
  licence: string;
  source?: string;
}

const CC_BY = 'CC BY 4.0';
const SKETCHFAB = 'Sketchfab Standard';

export const CREDITS: Credit[] = [
  { id: 'hospital_room', what: 'Hospital room furniture', title: 'Horror Hospital Room', author: 'KarolinaGlad', licence: CC_BY, source: 'https://sketchfab.com/3d-models/horror-hospital-room-56c9c40933644254b939ae2a22807d44' },
  { id: 'generator', what: 'Generator', title: 'Generator Stylized Sci-Fi Generator', author: 'Ghazi_3D', licence: CC_BY, source: 'https://sketchfab.com/3d-models/generator-stylized-sci-fi-generator-84577d2011644299bc150b045d2c5402' },
  { id: 'electrical', what: 'Electrical panels', title: 'Simple electrical environment', author: 'trashbinkr', licence: SKETCHFAB, source: 'https://sketchfab.com/3d-models/simple-electrical-environment-8b2d0bc5b19a448da56a7bc00e04c6d9' },
  { id: 'switch', what: 'Power switch', title: 'Simple Industrial ON/OFF Switch', author: 'trashbinkr', licence: SKETCHFAB, source: 'https://sketchfab.com/3d-models/simple-industrial-onoff-switch-7dac7f04ca474bf681b56fada14f5025' },
  { id: 'radiator', what: 'Radiators', title: 'Rusty Radiator', author: 'loxfear', licence: CC_BY, source: 'https://sketchfab.com/3d-models/rusty-radiator-37aedf976c6c4264a122f30562ca2aac' },
  { id: 'barrel', what: 'Barrels', title: 'Old tin barrel', author: '3dhdscan', licence: CC_BY, source: 'https://sketchfab.com/3d-models/old-tin-barrel-20f1ebee339a4b46b9e547782e2aaba9' },
  { id: 'toilet', what: 'Toilet', title: 'Toilet (game ready)', author: 'Sean Thomas', licence: CC_BY, source: 'https://sketchfab.com/3d-models/toilet-game-ready-d314d5882be14bc5b5a3914feff9382c' },
  { id: 'fluorescent', what: 'Ceiling lights', title: 'Fluorecent lights', author: 'Sean Thomas', licence: CC_BY, source: 'https://sketchfab.com/3d-models/fluorecent-lights-bca96f873b0743f88d61cd12b0750507' },
  // Update 0.9.5 — the model page's own link wasn't recorded; this search finds it (swap in the page link).
  { id: 'locker', what: 'Lockers', title: 'Dirty Locker (256x256 Retro)', author: 'xylvnking', licence: CC_BY, source: 'https://sketchfab.com/search?q=Dirty+Locker+256x256+Retro&type=models' },
  { id: 'brick', what: 'Brick', title: 'Brick Libra', author: 'Nikitos & 3130', licence: CC_BY, source: 'https://sketchfab.com/3d-models/brick-libra-ae48f306cd6446599197fb1aa0a31f88' },
  { id: 'bottle', what: 'Glass bottle', title: 'Beer Bottle', author: 'gelmi.com.br', licence: CC_BY, source: 'https://sketchfab.com/3d-models/beer-bottle-c3de7f8b092e4092aef14d4ffc9fac7f' },
  // Update 0.9.8 — the link is a search until the model page link is filled in (like the locker).
  { id: 'medkit', what: 'Med kit', title: 'Medkit_low', author: '3dmodelsst', licence: CC_BY, source: 'https://sketchfab.com/search?q=Medkit_low+3dmodelsst&type=models' },
  // Update 1.0.1 — Harrow Mill: walls, floors, roof plates, stairs, lamps, benches and props.
  { id: 'factory', what: 'Harrow Mill (the factory)', title: 'Abandoned Factory Modules', author: 'Thaddaeus', licence: CC_BY, source: 'https://sketchfab.com/3d-models/abandoned-factory-modules-1f8e4e72cafc4df18945a8a9cd22dd7d' },
  { id: 'mixamo', what: 'Characters and animations', title: 'Mixamo', author: 'Adobe', licence: 'Mixamo terms', source: 'https://www.mixamo.com' },
  { id: 'kenney', what: 'Control icons', title: 'Input Prompts', author: 'Kenney', licence: 'CC0', source: 'https://kenney.nl' },
  { id: 'fonts', what: 'Fonts', title: 'Special Elite, IBM Plex Mono', author: 'Astigmatic, IBM', licence: 'Apache 2.0, SIL OFL 1.1', source: 'https://fonts.google.com' },
];

/** Which credit each prop model comes under. */
export const PROP_CREDIT: Record<PropKind, string> = {
  hospital_bed: 'hospital_room',
  privacy_screen: 'hospital_room',
  bedside_flowers: 'hospital_room',
  bedside_drawing: 'hospital_room',
  bedside_meds: 'hospital_room',
  side_table: 'hospital_room',
  medicine_shelf: 'hospital_room',
  portrait: 'hospital_room',
  child_drawing: 'hospital_room',
  generator: 'generator',
  electrical_wall: 'electrical',
  brick_wall: 'electrical',
  breaker_box: 'electrical',
  power_switch: 'switch',
  radiator: 'radiator',
  barrel: 'barrel',
  barrel_lying: 'barrel',
  toilet: 'toilet',
  item_table: 'hospital_room',
  fluorescent: 'fluorescent',
  locker: 'locker',
  console: 'factory',
  crate: 'factory',
  crate_tall: 'factory',
  tank: 'factory',
  electric_box: 'factory',
  sign_caution: 'factory',
  sign_warning: 'factory',
  blueprint: 'factory',
};
