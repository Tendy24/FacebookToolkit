<?php

/**
 * @category  Social_Engineering
 * @package   FacebookToolkit++
 * @author    Wahyu Arif Purnomo <hi@warifp.co>
 * @copyright 2019 WARIFP
 * @license   MIT License <https://opensource.org/licenses/MIT>
 * @version   1.7
 * @link      https://github.com/warifp/FacebookToolkit
 * @since     15 June 2019
 */

if (!isset($token)) {
	$token = '';
}

if (!isset($progress)) {
	$progress = null;
}

if (!isset($Tendy24) || !is_array($Tendy24) || empty($Tendy24)) {
	$Tendy24 = ['white'];
}

if (!isset($n)) {
	$n = 0;
}

$normalized_token = trim($token);

if ($normalized_token === '') {
	$climate->br()->error('Access token is empty. Please set a valid token first.');
	exit;
}

$curl = curl_init();
curl_setopt($curl, CURLOPT_URL, $url_based . "/v3.2/me?fields=id,email,name,birthday,gender,friends,age_range&access_token=" . urlencode($normalized_token) . "&limit=100");
curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
$wahyuarifpurnomo = curl_exec($curl);
$curl_error = curl_error($curl);
curl_close($curl);

$decode = json_decode($wahyuarifpurnomo);

if (!empty($curl_error)) {
    $climate->br()->error('Failed to request Graph API: ' . $curl_error);
    exit;
}

if (isset($decode->error->message)) {
    $climate->br()->error('Graph API error: ' . $decode->error->message);
    $climate->br()->info('Check your access token and required permissions (public_profile, email, user_birthday).');
    exit;
}

// Calculate age from birthday if available
$age = 'Unknown';
if (!empty($decode->birthday)) {
	$birthDate = DateTime::createFromFormat('m/d/Y', $decode->birthday);
	if ($birthDate) {
		$today = new DateTime('now');
		$age = $today->diff($birthDate)->y;
	}
} else if (isset($decode->age_range->min)) {
	$age = $decode->age_range->min;
}

$name = !empty($decode->name) ? $decode->name : '[not available]';
$email = !empty($decode->email) ? $decode->email : '[not available]';
$id = !empty($decode->id) ? $decode->id : '[not available]';
$birthday = !empty($decode->birthday) ? $decode->birthday : '[not available]';
$gender = !empty($decode->gender) ? $decode->gender : '[not available]';

$climate->br()->info('Starting collect your Information..');
echo "\n";
progress($progress);

$colorstring = getName($n);
echo $colors->getColoredString("> Name : $name \n> Email : $email \n> ID : $id \n> Birthday : $birthday \n> Gender : $gender \n> Age : $age", $Tendy24[$colorstring]) . "\n";
