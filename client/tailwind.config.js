/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        project: {
          tsb: '#E24B4A',
          fc:  '#1D9E75',
          mc:  '#7F77DD',
          sd:  '#BA7517',
        },
        status: {
          green: { bg: '#E1F5EE', text: '#085041', border: '#1D9E75' },
          amber: { bg: '#FAEEDA', text: '#633806', border: '#EF9F27' },
          red:   { bg: '#FCEBEB', text: '#791F1F', border: '#E24B4A' },
          blue:  { bg: '#E6F1FB', text: '#0C447C' },
          gray:  { bg: '#F1EFE8', text: '#444441' },
        },
      },
    },
  },
  plugins: [],
};
