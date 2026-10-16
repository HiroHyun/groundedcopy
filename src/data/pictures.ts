// Four public-domain works from the Art Institute of Chicago, one per sentence on the
// switches, cropped from the museum's downloads. credits.json beside the pictures lists the sources.
import printer from '../assets/pictures/printer.jpg';
import museum from '../assets/pictures/museum.jpg';
import rice from '../assets/pictures/rice.jpg';
import laundress from '../assets/pictures/laundress.jpg';

export const pictures = [
  {
    src: printer,
    position: '50% 40%',
    title: 'The Etcher’s Press, The Printmaker’s Shop',
    creator: 'Abraham Bosse',
    date: '1642',
    page: 'https://www.artic.edu/artworks/76432',
    alt: {
      en: 'Etching of a print shop: one man pulls the arm of a rolling press while two others prepare plates.',
      zh: '蚀刻版画：印刷作坊里，一人拉动滚筒印刷机的把手，另外两人在准备铜版。',
    },
  },
  {
    src: museum,
    position: '50% 55%',
    title: 'The Grand Gallery of the Prado',
    creator: 'Joseph Pennell',
    date: '1903',
    page: 'https://www.artic.edu/artworks/115994',
    alt: {
      en: 'Drawing of the long gallery of the Prado, its walls hung with paintings under a vaulted skylight.',
      zh: '素描：普拉多博物馆的长廊，拱形天窗下的墙上挂满画作。',
    },
  },
  {
    src: rice,
    position: '62% 50%',
    title: 'Rural Scene in Early Summer: Peasants Transplanting Rice and a Man Washing a Horse',
    creator: 'Katsukawa Shun’ei',
    date: 'late 1790s',
    page: 'https://www.artic.edu/artworks/81444',
    alt: {
      en: 'Woodblock print of farmers planting rice in flooded fields while a man washes a horse.',
      zh: '木刻版画：农民在水田里插秧，旁边一人在给马洗澡。',
    },
  },
  {
    src: laundress,
    position: '50% 50%',
    title: 'The Laundresses',
    creator: 'Edgar Degas',
    date: '1879–80',
    page: 'https://www.artic.edu/artworks/93833',
    alt: {
      en: 'Etching of laundresses at work in a dim laundry.',
      zh: '蚀刻版画：昏暗的洗衣房里，洗衣女工正在干活。',
    },
  },
];
