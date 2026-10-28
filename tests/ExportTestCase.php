<?php
namespace TypographyStylist\Tests;

use Brain\Monkey\Functions;
use TypographyStylist\Tests\Support\FakeTypost;

/**
 * Shared setup for the export and import tests (#205): option storage,
 * the paragraph styles module, and a fake Typost that describes the site's
 * fonts.
 */
abstract class ExportTestCase extends TestCase {

    /** @var array Simulated wp_options storage */
    protected $options = array();

    /** @var FakeTypost */
    protected $site;

    /** @var object|null Typost singleton replaced for the test */
    private $savedTypost = null;

    protected function setUp(): void {
        parent::setUp();
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        Functions\when('plugin_dir_path')->justReturn(TYPOST_PLUGIN_DIR . '/paragraph-styles/');
        Functions\when('plugin_dir_url')->justReturn('http://localhost/paragraph-styles/');
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-export-fonts.php';
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-export.php';
        require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php';

        Functions\when('absint')->alias(function ($v) { return abs((int) $v); });
        Functions\when('current_time')->justReturn('2026-10-28');
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('delete_transient')->justReturn(true);
        Functions\when('current_user_can')->justReturn(true);
        Functions\when('is_wp_error')->alias(function ($thing) { return $thing instanceof \WP_Error; });
        Functions\when('sanitize_title')->alias(function ($title) {
            return trim(preg_replace('/[^a-z0-9]+/', '-', strtolower((string) $title)), '-');
        });
        Functions\when('rest_ensure_response')->returnArg();

        $options = &$this->options;
        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });

        $this->site = new FakeTypost();

        // save_styles() clears core's font detection cache through the
        // Typost singleton when the class is loaded (another test may have
        // loaded it).
        if (class_exists('Typost')) {
            $property = (new \ReflectionClass(\Typost::class))->getProperty('instance');
            $property->setAccessible(true);
            $this->savedTypost = $property->getValue();
            $property->setValue(null, $this->site);
        }
    }

    protected function tearDown(): void {
        if (class_exists('Typost')) {
            $property = (new \ReflectionClass(\Typost::class))->getProperty('instance');
            $property->setAccessible(true);
            $property->setValue(null, $this->savedTypost);
        }
        parent::tearDown();
    }

    /**
     * The paragraph styles module with these styles stored.
     *
     * @param array $styles  Stored styles.
     * @param int   $counter Next ID counter.
     * @return \Typost_Paragraph_Styles
     */
    protected function module(array $styles = array(), $counter = null) {
        $this->options['typost_paragraph_styles'] = $styles;
        if (null !== $counter) {
            $this->options['typost_paragraph_styles_next_id'] = $counter;
        }
        return (new \ReflectionClass(\Typost_Paragraph_Styles::class))->newInstanceWithoutConstructor();
    }

    /**
     * Export with the paragraph styles section registered, the way the
     * REST route runs it.
     *
     * @param \Typost_Paragraph_Styles $module Module.
     * @param array                    $args   build_export() arguments.
     * @return array|\WP_Error
     */
    protected function exportWith($module, array $args) {
        $this->registerSection($module);
        return (new \Typost_Export($this->site))->build_export($args);
    }

    /**
     * Make apply_filters('typost_export_sections') return the module's section.
     *
     * @param \Typost_Paragraph_Styles $module Module.
     */
    protected function registerSection($module) {
        $transfer = new \Typost_PS_Transfer($module);
        Functions\when('apply_filters')->alias(function ($hook, $value) use ($transfer) {
            if ('typost_export_sections' === $hook) {
                return $transfer->register_section($value);
            }
            return $value;
        });
    }

    /**
     * An export file's text, as the browser would send it.
     *
     * @param array $file build_export()['file'].
     * @return string
     */
    protected function fileText(array $file) {
        return json_encode($file);
    }

    /**
     * The stored styles.
     *
     * @return array
     */
    protected function storedStyles() {
        return $this->options['typost_paragraph_styles'];
    }

    /**
     * A stored style by name.
     *
     * @param string $name Name.
     * @return array|null
     */
    protected function storedStyle($name) {
        foreach ($this->storedStyles() as $style) {
            if ($style['name'] === $name) {
                return $style;
            }
        }
        return null;
    }
}
