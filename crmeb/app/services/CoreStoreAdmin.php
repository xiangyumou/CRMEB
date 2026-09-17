<?php
namespace app\services;

final class CoreStoreAdmin
{
    public static function config(): array
    {
        static $config;
        if ($config === null) {
            $config = json_decode(file_get_contents(dirname(__DIR__, 2) . '/config/core_store_removed_admin.json'), true, 512, JSON_THROW_ON_ERROR);
        }
        return $config;
    }

    public static function isRemovedPath(string $path): bool
    {
        $path = '/' . ltrim($path, '/');
        $prefix = '/' . trim((string)config('app.admin_prefix', 'admin'), '/');
        if (strpos($path, $prefix . '/') === 0) $path = substr($path, strlen($prefix));
        foreach (self::config()['menuPaths'] as $removed) {
            if ($path === $removed || strpos($path, $removed . '/') === 0) return true;
        }
        return false;
    }

    public static function filterMenus(array $menus): array
    {
        $children = [];
        $byId = [];
        foreach ($menus as $menu) {
            $children[(int)$menu['pid']][] = (int)$menu['id'];
            $byId[(int)$menu['id']] = $menu;
        }
        $removed = [];
        foreach ($menus as $menu) {
            if (self::isRemovedPath((string)$menu['menu_path'])) $removed[(int)$menu['id']] = true;
        }
        // A parent with a retained child must remain navigable.
        do {
            $changed = false;
            foreach ($menus as $menu) {
                $id = (int)$menu['id'];
                if (!isset($removed[$id])) continue;
                foreach ($children[$id] ?? [] as $child) {
                    $childMenu = $byId[$child] ?? null;
                    if ($childMenu && !isset($removed[$child]) && !in_array($childMenu['menu_path'], ['', '/'], true)) {
                        unset($removed[$id]);
                        $changed = true;
                        break;
                    }
                }
            }
        } while ($changed);
        do {
            $changed = false;
            foreach ($menus as $menu) {
                $id = (int)$menu['id'];
                if (isset($removed[(int)$menu['pid']]) && !isset($removed[$id])) {
                    $removed[$id] = true;
                    $changed = true;
                }
            }
        } while ($changed);
        $retained = array_values(array_filter($menus, static function ($menu) use ($removed) {
            return !isset($removed[(int)$menu['id']]);
        }));
        // Redirect a surviving group header away from its retired default page.
        foreach ($retained as &$menu) {
            if (!self::isRemovedPath((string)$menu['menu_path'])) continue;
            foreach ($retained as $child) {
                if ((int)$child['pid'] === (int)$menu['id'] && !self::isRemovedPath((string)$child['menu_path'])) {
                    $menu['menu_path'] = $child['menu_path'];
                    break;
                }
            }
        }
        unset($menu);
        return $retained;
    }

    public static function removedMenuIds(array $menus): array
    {
        $filtered = self::filterMenus($menus);
        $kept = array_fill_keys(array_column($filtered, 'id'), true);
        return array_values(array_map('intval', array_filter(array_column($menus, 'id'), static function ($id) use ($kept) {
            return !isset($kept[$id]);
        })));
    }
}
