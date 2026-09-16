<?php
use think\facade\Route;
Route::miss(function () { return \think\Response::create()->code(404); });
