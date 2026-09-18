<?php
namespace app\services\diy;

use app\services\CoreStore;

final class DiyCompatibilityServices
{
    /**
     * The H5 pages the storefront no longer ships.
     * @return string[]
     */
    public static function removedPages(): array
    {
        static $paths;
        if ($paths === null) $paths = json_decode(file_get_contents(dirname(__DIR__, 3) . '/config/core_store_removed_pages.json'), true) ?: [];
        return $paths;
    }

    /** Whether a navigation target points at a page that is no longer shipped. */
    public static function isRemovedPage($url): bool
    {
        if (!is_string($url) || $url === '') return false;
        if (strpos($url, 'http') === 0) return false;
        return in_array(ltrim(explode('?', $url)[0], '/'), self::removedPages(), true);
    }

    public static function clean($data)
    {
        if (!is_array($data)) return $data;
        $paths = self::removedPages();
        $isList = array_keys($data) === range(0, count($data) - 1);
        foreach ($data as $key => $value) {
            if (in_array((string)$key, CoreStore::REMOVED_COMPONENTS, true) ||
                (is_array($value) && in_array($value['name'] ?? '', CoreStore::REMOVED_COMPONENTS, true))) {
                unset($data[$key]); continue;
            }
            if (!is_array($value)) continue;
            $navigationTarget = $value['info'][1]['value'] ?? null;
            if (is_string($navigationTarget) && in_array(ltrim(explode('?', $navigationTarget)[0], '/'), $paths, true)) {
                unset($data[$key]); continue;
            }

            foreach (['link','url','value'] as $field) {
                if (isset($value[$field]) && is_string($value[$field]) && in_array(ltrim(explode('?', $value[$field])[0], '/'), $paths, true)) {
                    unset($data[$key]); continue 2;
                }
            }
            $data[$key] = self::clean($value);
        }
        return $isList ? array_values($data) : $data;
    }
}
