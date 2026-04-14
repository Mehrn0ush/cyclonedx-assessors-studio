import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.assessor.studio',
  integrations: [
    starlight({
      title: 'Assessors Studio',
      description:
        'Operationalize trust with CycloneDX Attestations. Documentation for administrators, assessors, assessees, and standards owners.',
      logo: {
        light: './src/assets/cyclonedx-logo-light.svg',
        dark: './src/assets/cyclonedx-logo.svg',
        replacesTitle: false,
      },
      favicon: '/favicon.ico',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/CycloneDX/cyclonedx-assessors-studio',
        },
      ],
      customCss: ['./src/styles/theme.css'],
      editLink: {
        baseUrl:
          'https://github.com/CycloneDX/cyclonedx-assessors-studio/edit/main/docs/',
      },
      lastUpdated: true,
      pagination: true,
      components: {
        // Use Starlight defaults; theme overrides happen via CSS.
      },
      sidebar: [
        {
          label: 'Introduction',
          items: [
            { label: 'Welcome', slug: 'introduction/welcome' },
            {
              label: 'CycloneDX Attestations',
              slug: 'introduction/cyclonedx-attestations',
            },
            {
              label: 'What is Assessors Studio',
              slug: 'introduction/what-is-assessors-studio',
            },
            { label: 'Core Concepts', slug: 'introduction/concepts' },
            { label: 'Who It Is For', slug: 'introduction/audiences' },
          ],
        },
        {
          label: 'Getting Started',
          items: [
            { label: 'First Login', slug: 'getting-started/first-login' },
            { label: 'A Guided Tour', slug: 'getting-started/tour' },
            {
              label: 'Your First Assessment',
              slug: 'getting-started/first-assessment',
            },
          ],
        },
        {
          label: 'User Guide',
          items: [
            { label: 'Dashboards', slug: 'user-guide/dashboards' },
            { label: 'Entities', slug: 'user-guide/entities' },
            { label: 'Projects', slug: 'user-guide/projects' },
            { label: 'Standards', slug: 'user-guide/standards' },
            { label: 'Assessments', slug: 'user-guide/assessments' },
            {
              label: 'Evidence and Claims',
              slug: 'user-guide/evidence-and-claims',
            },
            {
              label: 'Producing Attestations',
              slug: 'user-guide/producing-attestations',
            },
            { label: 'Notifications', slug: 'user-guide/notifications' },
          ],
        },
        {
          label: 'Administration',
          items: [
            {
              label: 'Deployment',
              slug: 'administration/deployment',
            },
            {
              label: 'Initial Setup Wizard',
              slug: 'administration/initial-setup',
            },
            {
              label: 'Users and Permissions',
              slug: 'administration/users-and-permissions',
            },
            {
              label: 'Standards Lifecycle',
              slug: 'administration/standards-lifecycle',
            },
            {
              label: 'Integrations',
              slug: 'administration/integrations',
            },
            {
              label: 'Evidence Storage',
              slug: 'administration/storage',
            },
            {
              label: 'Encryption at Rest',
              slug: 'administration/encryption-at-rest',
            },
            {
              label: 'Metrics and Monitoring',
              slug: 'administration/metrics-and-monitoring',
            },
            {
              label: 'Backup and Recovery',
              slug: 'administration/backup-and-recovery',
            },
            {
              label: 'Upgrades',
              slug: 'administration/upgrades',
            },
          ],
        },
        {
          label: 'Configuration',
          items: [
            {
              label: 'Environment Variables',
              slug: 'configuration/environment-variables',
            },
          ],
        },
        {
          label: 'Operations',
          items: [
            { label: 'Health Checks', slug: 'operations/health-checks' },
            { label: 'Logging', slug: 'operations/logging' },
            { label: 'Troubleshooting', slug: 'operations/troubleshooting' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'API and OpenAPI', slug: 'reference/api' },
            { label: 'Glossary', slug: 'reference/glossary' },
            { label: 'Release Notes', slug: 'reference/release-notes' },
          ],
        },
      ],
    }),
  ],
});
