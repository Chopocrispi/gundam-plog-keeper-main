import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Minimal translation resources (extend as needed)
const resources = {
  en: {
    translation: {
      app: {
        title: 'Gundam Collection',
        subtitle: 'Track and manage your Gunpla model kits',
        searchPlaceholder: 'Search models...',
        filterByGrade: 'Filter by grade',
        allGrades: 'All Grades',
      },
      form: {
        name: 'Name',
        series: 'Series',
        grade: 'Grade',
        buildStatus: 'Build Status',
        notes: 'Notes',
        image: 'Image',
        cancel: 'Cancel',
        save: 'Save',
      },
      grade: {
        hg: 'High Grade (HG)',
        rg: 'Real Grade (RG)',
        mg: 'Master Grade (MG)',
        pg: 'Perfect Grade (PG)',
        fm: 'Full Mechanics (FM)',
        sd: 'Super Deformed (SD)',
      },
      status: {
        unbuilt: 'Unbuilt',
        inProgress: 'In Progress',
        built: 'Built',
        painted: 'Painted',
        customized: 'Customized',
      }
    }
  },
  es: {
    translation: {
      app: {
        title: 'Colección Gundam',
        subtitle: 'Registra y gestiona tus kits de Gunpla',
        searchPlaceholder: 'Buscar modelos...',
        filterByGrade: 'Filtrar por grado',
        allGrades: 'Todos los grados',
      },
      form: {
        name: 'Nombre',
        series: 'Serie',
        grade: 'Grado',
        buildStatus: 'Estado de armado',
        notes: 'Notas',
        image: 'Imagen',
        cancel: 'Cancelar',
        save: 'Guardar',
      },
      grade: {
        hg: 'High Grade (HG)',
        rg: 'Real Grade (RG)',
        mg: 'Master Grade (MG)',
        pg: 'Perfect Grade (PG)',
        fm: 'Full Mechanics (FM)',
        sd: 'Super Deformed (SD)',
      },
      status: {
        unbuilt: 'Sin armar',
        inProgress: 'En progreso',
        built: 'Armado',
        painted: 'Pintado',
        customized: 'Personalizado',
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      // default order detects from: querystring, cookie, localStorage, navigator, htmlTag, path, subdomain
      // we'll rely primarily on navigator/localStorage and not persist by default
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: [],
    },
  });

export default i18n;